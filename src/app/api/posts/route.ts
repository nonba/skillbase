import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendWebPush } from "@/lib/webpush";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    // OB(卒団者)アカウントは、チームの通常のタイムラインには一切アクセスできない。
    // OB配信グループ宛ての投稿(大会案内・周年行事など、コーチからの一方通行の連絡)のみ閲覧可。
    const isOB = (session.user as any).graduated === true;

    let postWhere: any;
    if (isOB) {
      const obGroup = await db.group.findFirst({
        where: { teamId: session.user.teamId, isObGroup: true },
        select: { id: true },
      });
      postWhere = {
        teamId: session.user.teamId,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { targetGroups: { some: { id: obGroup?.id ?? "__none__" } } },
        ],
      };
    } else {
      const myGroups = await db.group.findMany({
        where: {
          teamId: session.user.teamId,
          members: {
            some: { id: session.user.id },
          },
        },
        select: { id: true },
      });

      const myGroupIds = myGroups.map((g) => g.id);

      postWhere = {
        teamId: session.user.teamId,
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
          {
            OR: [
              {
                authorId: session.user.id,
              },
              {
                targetGroups: {
                  none: {},
                },
              },
              {
                targetGroups: {
                  some: {
                    id: {
                      in: myGroupIds,
                    },
                  },
                },
              },
            ],
          },
        ],
      };
    }

    const posts = await db.post.findMany({
      where: postWhere,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            jerseyNumber: true,
          },
        },
        targetGroups: {
          select: {
            id: true,
            name: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        likes: {
          select: {
            userId: true,
          },
        },
        poll: {
          include: {
            answers: {
              select: {
                userId: true,
                selectedOption: true,
                user: { select: { name: true, jerseyNumber: true } },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ posts });
  } catch (error: any) {
    console.error("Timeline posts fetch error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    if ((session.user as any).graduated === true) {
      return NextResponse.json({ error: "OBアカウントは投稿できません。" }, { status: 403 });
    }

    const { content, imageUrl, thumbnailUrl, imageSize, isInfo, isStory, isVideo, targetGroupIds, poll, fileUrl, fileName } = await req.json();

    // アンケート付き投稿は本文/画像が無くてもOK（質問＋2択以上あれば）
    const hasPoll = poll && typeof poll.question === "string" && poll.question.trim() && Array.isArray(poll.options) && poll.options.filter((o: string) => String(o).trim()).length >= 2;
    if (!content && !imageUrl && !fileUrl && !hasPoll) {
      return NextResponse.json({ error: "投稿内容を入力するか、画像/動画・ファイル・アンケートを追加してください。" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManagePosts: true, role: true, groups: { select: { id: true } } }
    });

    const isPostAdmin = user?.isOwner || user?.canManagePosts || user?.role === "MANAGER";

    if (!isPostAdmin) {
      // 一般ユーザーは自分の所属するグループ、または全体（宛先指定なし）への投稿のみ可能
      if (targetGroupIds && Array.isArray(targetGroupIds) && targetGroupIds.length > 0) {
        const myGroupIds = user?.groups.map(g => g.id) || [];
        const hasUnjoinedGroup = targetGroupIds.some(id => !myGroupIds.includes(id));
        if (hasUnjoinedGroup) {
          return NextResponse.json({ error: "所属していないグループへの投稿権限がありません。" }, { status: 403 });
        }
      }
    }

    let expiresAt: Date | undefined = undefined;
    if (isStory) {
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 24);
      expiresAt = tomorrow;
    }

    const post = await db.post.create({
      data: {
        content: content || "",
        imageUrl: imageUrl || null,
        thumbnailUrl: thumbnailUrl || null,
        isVideo: isVideo !== undefined ? Boolean(isVideo) : false,
        fileUrl: fileUrl || null,
        fileName: fileUrl && fileName ? String(fileName).slice(0, 200) : null,
        expiresAt,
        isInfo: isInfo !== undefined ? Boolean(isInfo) : false,
        authorId: session.user.id,
        teamId: session.user.teamId!,
        targetGroups: targetGroupIds && Array.isArray(targetGroupIds)
          ? {
              connect: targetGroupIds.map((id: string) => ({ id })),
            }
          : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        targetGroups: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // アンケート付きなら作成
    if (hasPoll) {
      const options = (poll.options as string[]).map((o) => String(o).trim()).filter(Boolean);
      await db.postPoll.create({
        data: {
          postId: post.id,
          question: String(poll.question).trim(),
          options: options.join(","),
          resultsVisibleToAll: Boolean(poll.resultsVisibleToAll),
        },
      });
    }

    // ストレージ使用量の更新 (Cloudflare R2移行対応)
    if (imageUrl && imageSize && typeof imageSize === "number" && session.user.teamId) {
      try {
        await db.team.update({
          where: { id: session.user.teamId },
          data: {
            storageUsedBytes: {
              increment: imageSize,
            },
          },
        });
        console.log(`Storage updated for team ${session.user.teamId}: +${imageSize} bytes via post creation`);
      } catch (err) {
        console.error("Failed to update storage usage on post create:", err);
      }
    }

    // プッシュ通知を送信 (ハイライト/ストーリーズ以外の場合のみ)
    if (!isStory) {
      try {
        const targetUsers = await db.user.findMany({
          where: {
            teamId: session.user.teamId,
            id: { not: session.user.id }, // 自分自身には送らない
            ...(targetGroupIds && Array.isArray(targetGroupIds) && targetGroupIds.length > 0
              ? { groups: { some: { id: { in: targetGroupIds } } } }
              : {}),
          },
          select: { 
            pushSubscriptions: true,
            devices: {
              where: {
                pushToken: { not: null }
              }
            }
          },
        });

        const notificationPayload = {
          title: isInfo ? "📌 重要な連絡" : "新しい連絡事項",
          body: `${session.user.name}さんから新しい連絡がありました。`,
          url: "/dashboard/timeline",
          type: "timeline"
        };

        // WebPush送信
        const subscriptions = targetUsers.flatMap((u) => u.pushSubscriptions);
        if (subscriptions.length > 0) {
          console.log(`Sending web push to ${subscriptions.length} subscriptions for post ${post.id}`);
          sendWebPush(subscriptions, notificationPayload as any).then(() => {
            console.log(`Successfully sent web push for post ${post.id}`);
          }).catch(err => {
            console.error("sendWebPush API returned an error:", err);
          });
        }

        // ネイティブFCM送信
        const nativeTokens = targetUsers.flatMap((u) => 
          u.devices.map((d) => d.pushToken).filter((t): t is string => !!t)
        );
        if (nativeTokens.length > 0) {
          console.log(`Sending native push to ${nativeTokens.length} devices for post ${post.id}`);
          const { sendNativePush } = await import("@/lib/webpush");
          await sendNativePush(nativeTokens, notificationPayload);
        }
      } catch (e) {
        console.error("Push notification logic error in post creation:", e);
      }
    }

    return NextResponse.json({
      message: "投稿を作成しました。",
      post,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Post create error:", error);
    return NextResponse.json({ error: `サーバーエラーが発生しました: ${error.message || error}` }, { status: 500 });
  }
}
