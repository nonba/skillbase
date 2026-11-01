import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db as prisma } from "@/lib/db";

// 自分が参加しているトークルーム一覧を取得
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 自分が参加している ConversationParticipant を取得
    const myParticipants = await prisma.conversationParticipant.findMany({
      where: { userId: session.user.id },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1, // 最新の1件だけ取得
              include: {
                sender: {
                  select: { id: true, name: true }
                }
              }
            },
          },
        },
      },
    });

    // OB(卒団者)アカウントは指導者とのやりとりのみ見える(卒団前の一般DMは非表示)
    const isOB = (session.user as any).graduated === true;
    const visibleParticipants = isOB
      ? myParticipants.filter((p) =>
          p.conversation.participants.some((cp) => cp.userId !== session.user.id && cp.user.role === "MANAGER")
        )
      : myParticipants;

    // クライアント側で使いやすい形に整形
    const conversations = visibleParticipants.map((p) => {
      const conv = p.conversation;
      const otherParticipants = conv.participants.filter(
        (cp) => cp.userId !== session.user.id
      );
      
      const latestMessage = conv.messages[0] || null;
      
      // 自分が最後に既読にした時間より新しいメッセージが何件あるか（簡易計算用）
      // ※正確な未読件数を出すには別途カウントが必要ですが、ここでは最新メッセージの日時と比較します
      const hasUnread = latestMessage && latestMessage.createdAt > p.lastReadAt && latestMessage.senderId !== session.user.id;

      return {
        id: conv.id,
        teamId: conv.teamId,
        createdAt: conv.createdAt,
        otherParticipants: otherParticipants.map(cp => cp.user),
        latestMessage,
        hasUnread,
        lastReadAt: p.lastReadAt,
      };
    });

    // 最新のメッセージ順にソート
    conversations.sort((a, b) => {
      const dateA = a.latestMessage ? a.latestMessage.createdAt.getTime() : a.createdAt.getTime();
      const dateB = b.latestMessage ? b.latestMessage.createdAt.getTime() : b.createdAt.getTime();
      return dateB - dateA;
    });

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("[MESSAGES_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// 新規トークルームの作成（または既存の取得）
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { targetUserIds, teamId } = await req.json();

    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0 || !teamId) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    // メッセージは1対1が基本。複数人になれるのは「紐づいた親子セット」のみ
    // （例: 選手＋その親、で指導者と進路相談）。自由なグループチャットは管理者含め作成不可。
    // 理由: 連絡の置き場は「タイムライン（宛先グループ）・予定コメント・DM」の3分割を維持するため。
    const targets: string[] = Array.from(new Set(targetUserIds.filter((id: string) => id && id !== session.user.id)));
    if (targets.length === 0) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    // OB(卒団者)アカウントは指導者とのメッセージのみ許可（近況連絡・進路相談用）
    // 会話は自分と同じチームのメンバー同士に限る（他チームのユーザーや、他チームIDでの会話作成を防ぐ）
    const myTeamId = (session.user as any).teamId;
    if (!myTeamId || teamId !== myTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sameTeamCount = await prisma.user.count({ where: { id: { in: targets }, teamId: myTeamId } });
    if (sameTeamCount !== targets.length) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if ((session.user as any).graduated === true) {
      const targetUsers = await prisma.user.findMany({
        where: { id: { in: targets } },
        select: { id: true, role: true },
      });
      const allManagers = targetUsers.length === targets.length && targetUsers.every((u) => u.role === "MANAGER");
      if (!allManagers) {
        return NextResponse.json({ error: "OBアカウントは指導者にのみメッセージを送れます。" }, { status: 403 });
      }
    }

    if (targets.length > 1) {
      const targetUsers = await prisma.user.findMany({
        where: { id: { in: targets } },
        select: {
          id: true,
          parents: { select: { id: true } },
          children: { select: { id: true } },
        },
      });
      // いずれかの1人を「主」としたとき、残り全員がその親または子であればOK
      const isLinkedSet = targetUsers.some((u) => {
        const familyIds = new Set([...u.parents.map((p) => p.id), ...u.children.map((c) => c.id)]);
        return targets.every((t) => t === u.id || familyIds.has(t));
      });
      if (!isLinkedSet) {
        return NextResponse.json(
          { error: "メッセージは1対1、または紐づいた親子セットのみ作成できます。" },
          { status: 403 }
        );
      }
    }

    // 参加者全員のIDリスト (自分 + ターゲット)
    const allParticipantIds = [session.user.id, ...targets];
    // 重複を削除してソート（検索用）
    const uniqueIds = Array.from(new Set(allParticipantIds)).sort();

    // 既存の会話を探す（メンバーが完全に一致するもの）
    // ※Prismaで完全一致を探すのは少し複雑なので、自分が参加しているものを取得してJSでフィルタリング
    const myConversations = await prisma.conversationParticipant.findMany({
      where: { userId: session.user.id },
      include: {
        conversation: {
          include: {
            participants: true
          }
        }
      }
    });

    let existingConversation: any = null;
    for (const p of myConversations) {
      const conv = p.conversation;
      if (conv.teamId !== teamId) continue;
      
      const participantIds = conv.participants.map(cp => cp.userId).sort();
      if (JSON.stringify(participantIds) === JSON.stringify(uniqueIds)) {
        existingConversation = conv;
        break;
      }
    }

    if (existingConversation) {
      return NextResponse.json(existingConversation);
    }

    // 存在しない場合は新規作成
    const newConversation = await prisma.conversation.create({
      data: {
        teamId,
        participants: {
          create: uniqueIds.map(userId => ({
            userId
          }))
        }
      }
    });

    return NextResponse.json(newConversation);
  } catch (error) {
    console.error("[MESSAGES_POST]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
