import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendWebPush } from "@/lib/webpush";

export function isColumnVisibleToUser(
  col: {
    authorId: string;
    targetType: string;
    targetGrades: string | null;
    targetGroups: { id: string }[];
    targetUsers: { id: string }[];
  },
  ctx: {
    userId: string;
    isCoach: boolean;
    relevantUserIds: Set<string>;
    relevantGrades: Set<number>;
    relevantGroupIds: Set<string>;
  }
): boolean {
  if (ctx.isCoach || col.authorId === ctx.userId) return true;
  if (col.targetType === "ALL") return true;

  if (col.targetType === "GRADES") {
    const grades = (col.targetGrades || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    return grades.some((g) => ctx.relevantGrades.has(g));
  }

  if (col.targetType === "GROUPS") {
    return col.targetGroups.some((g) => ctx.relevantGroupIds.has(g.id));
  }

  if (col.targetType === "USERS") {
    return col.targetUsers.some((u) => ctx.relevantUserIds.has(u.id));
  }

  return true;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    if (!session.user.teamId) {
      return NextResponse.json({ columns: [], unreadCount: 0 });
    }

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isOwner: true,
        canManagePosts: true,
        grade: true,
        groups: { select: { id: true } },
        children: {
          select: {
            id: true,
            grade: true,
            groups: { select: { id: true } },
          },
        },
      },
    });

    if (!me) {
      return NextResponse.json({ error: "ユーザーが見つかりません。" }, { status: 404 });
    }

    const isCoach = Boolean(me.isOwner || me.canManagePosts || me.role === "MANAGER");
    const relevantUserIds = new Set<string>([
      me.id,
      ...me.children.map((c) => c.id),
    ]);
    const relevantGrades = new Set<number>(
      [me.grade, ...me.children.map((c) => c.grade)].filter(
        (g): g is number => g !== null && g !== undefined
      )
    );
    const relevantGroupIds = new Set<string>([
      ...me.groups.map((g) => g.id),
      ...me.children.flatMap((c) => c.groups.map((g) => g.id)),
    ]);

    const allColumns = await db.column.findMany({
      where: { teamId: session.user.teamId },
      include: {
        author: {
          select: { id: true, name: true, role: true },
        },
        targetGroups: {
          select: { id: true, name: true },
        },
        targetUsers: {
          select: { id: true, name: true, jerseyNumber: true, grade: true },
        },
        reads: {
          select: {
            userId: true,
            createdAt: true,
            user: { select: { id: true, name: true, jerseyNumber: true, grade: true, role: true } },
          },
        },
        bookmarks: {
          where: { userId: me.id },
          select: { userId: true },
        },
        _count: {
          select: { comments: true, reads: true },
        },
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });

    const visibleColumns = allColumns
      .filter((col) =>
        isColumnVisibleToUser(col, {
          userId: me.id,
          isCoach,
          relevantUserIds,
          relevantGrades,
          relevantGroupIds,
        })
      )
      .map((col) => {
        const isRead = col.reads.some((r) => r.userId === me.id);
        const isBookmarked = col.bookmarks.length > 0;
        return {
          ...col,
          isRead,
          isBookmarked,
          commentCount: col._count.comments,
          readCount: col.reads.length,
        };
      });

    const unreadCount = visibleColumns.filter((c) => !c.isRead && c.authorId !== me.id).length;

    return NextResponse.json({
      columns: visibleColumns,
      unreadCount,
      isCoach,
    });
  } catch (error: any) {
    console.error("Columns GET error:", error);
    return NextResponse.json(
      { error: "コラムの取得に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.teamId) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManagePosts: true, role: true, name: true },
    });

    const isCoach = Boolean(me?.isOwner || me?.canManagePosts || me?.role === "MANAGER");
    if (!isCoach) {
      return NextResponse.json(
        { error: "コラムの投稿権限がありません（指導者・管理者のみ投稿可能）。" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      title,
      content,
      category,
      youtubeUrl,
      videoUrl,
      imageUrl,
      thumbnailUrl,
      fileUrl,
      fileName,
      isPinned,
      allowComments,
      targetType,
      targetGrades,
      targetGroupIds,
      targetUserIds,
    } = body;

    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: "タイトルを入力してください。" }, { status: 400 });
    }
    if (!content?.trim() && !youtubeUrl?.trim() && !videoUrl && !imageUrl && !fileUrl) {
      return NextResponse.json(
        { error: "本文または動画・資料を1つ以上入力してください。" },
        { status: 400 }
      );
    }

    const normalizedTargetType = ["ALL", "GRADES", "GROUPS", "USERS"].includes(targetType)
      ? targetType
      : "ALL";

    const gradesStr =
      normalizedTargetType === "GRADES" && Array.isArray(targetGrades)
        ? targetGrades.map((g: any) => String(g)).join(",")
        : typeof targetGrades === "string"
        ? targetGrades
        : null;

    const column = await db.column.create({
      data: {
        teamId: session.user.teamId,
        authorId: session.user.id,
        title: String(title).trim(),
        content: String(content || ""),
        category: category || "BATTING",
        youtubeUrl: youtubeUrl ? String(youtubeUrl).trim() : null,
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null,
        thumbnailUrl: thumbnailUrl || null,
        fileUrl: fileUrl || null,
        fileName: fileUrl && fileName ? String(fileName).slice(0, 200) : null,
        isPinned: Boolean(isPinned),
        allowComments: allowComments !== undefined ? Boolean(allowComments) : true,
        targetType: normalizedTargetType,
        targetGrades: gradesStr,
        targetGroups:
          normalizedTargetType === "GROUPS" && Array.isArray(targetGroupIds) && targetGroupIds.length > 0
            ? { connect: targetGroupIds.map((id: string) => ({ id })) }
            : undefined,
        targetUsers:
          normalizedTargetType === "USERS" && Array.isArray(targetUserIds) && targetUserIds.length > 0
            ? { connect: targetUserIds.map((id: string) => ({ id })) }
            : undefined,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        targetGroups: { select: { id: true, name: true } },
        targetUsers: { select: { id: true, name: true, jerseyNumber: true, grade: true } },
      },
    });

    // プッシュ通知を配信対象メンバーへ送信
    try {
      let recipientWhere: any = {
        teamId: session.user.teamId,
        id: { not: session.user.id },
        graduated: false,
      };

      if (normalizedTargetType === "GRADES" && gradesStr) {
        const gradeNums = gradesStr
          .split(",")
          .map((s) => parseInt(s, 10))
          .filter((n) => !isNaN(n));
        recipientWhere.OR = [
          { grade: { in: gradeNums } },
          { children: { some: { grade: { in: gradeNums } } } },
        ];
      } else if (normalizedTargetType === "GROUPS" && Array.isArray(targetGroupIds) && targetGroupIds.length > 0) {
        recipientWhere.OR = [
          { groups: { some: { id: { in: targetGroupIds } } } },
          { children: { some: { groups: { some: { id: { in: targetGroupIds } } } } } },
        ];
      } else if (normalizedTargetType === "USERS" && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        recipientWhere.OR = [
          { id: { in: targetUserIds } },
          { children: { some: { id: { in: targetUserIds } } } },
        ];
      }

      const targetUsers = await db.user.findMany({
        where: recipientWhere,
        select: {
          pushSubscriptions: true,
          devices: { where: { pushToken: { not: null } } },
        },
      });

      const notificationPayload = {
        title: normalizedTargetType === "USERS" ? "🎯 あなた宛ての指導コラム・動画" : "📚 新しいコラム・教材が配信されました",
        body: `「${column.title}」（${me?.name || "指導者"}）`,
        url: `/dashboard/columns/${column.id}`,
        type: "column",
      };

      const subscriptions = targetUsers.flatMap((u) => u.pushSubscriptions);
      if (subscriptions.length > 0) {
        sendWebPush(subscriptions, notificationPayload as any).catch((err) =>
          console.error("Column webpush error:", err)
        );
      }

      const nativeTokens = targetUsers.flatMap((u) =>
        u.devices.map((d) => d.pushToken).filter((t): t is string => !!t)
      );
      if (nativeTokens.length > 0) {
        const { sendNativePush } = await import("@/lib/webpush");
        await sendNativePush(nativeTokens, notificationPayload);
      }
    } catch (pushErr) {
      console.error("Push error on column creation:", pushErr);
    }

    return NextResponse.json({ column }, { status: 201 });
  } catch (error: any) {
    console.error("Columns POST error:", error);
    return NextResponse.json(
      { error: `作成に失敗しました: ${error.message || error}` },
      { status: 500 }
    );
  }
}
