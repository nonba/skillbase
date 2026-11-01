import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db as prisma } from "@/lib/db";

// 特定のトークルームのメッセージ履歴取得
export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await params;

    // 自分がこのトークルームの参加者か確認
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // メッセージ履歴を取得
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    });

    // 会話の参加者を取得
    const participantsList = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
      },
    });
    const participants = participantsList.map((p) => p.user);

    // 既読フラグを更新 (lastReadAt)
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({ messages, participants });
  } catch (error) {
    console.error("[MESSAGES_CONV_GET]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// 新規メッセージの送信
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await params;
    const { content, imageUrl } = await req.json();

    if (!content && !imageUrl) {
      return NextResponse.json({ error: "Content or image is required" }, { status: 400 });
    }

    // 自分がこのトークルームの参加者か確認
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // メッセージを作成
    const newMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId: session.user.id,
        content: content || "",
        imageUrl: imageUrl || null,
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    });

    // 自分の既読時間も更新しておく
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });
    
    // Conversation の updatedAt も更新（一覧画面のソート用）
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // リアルタイムPusher通知
    try {
      const { pusherServer, userChannelName } = await import("@/lib/pusher");
      const otherParticipants = await prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          userId: { not: session.user.id }
        }
      });

      for (const p of otherParticipants) {
        await pusherServer.trigger(userChannelName(p.userId), "new-message", {
          conversationId,
          messageId: newMessage.id,
          senderName: session.user.name,
          content: content || "📷 画像を送信しました"
        });
      }
    } catch (pusherErr) {
      console.error("Failed to send Pusher notification for message:", pusherErr);
    }
 
    // 自分以外の参加者宛てにWebプッシュ通知を送信
    try {
      const otherParticipants = await prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          userId: { not: session.user.id }
        },
        include: {
          user: {
            include: {
              pushSubscriptions: true,
              devices: {
                where: {
                  pushToken: { not: null }
                }
              }
            }
          }
        }
      });

      const notificationPayload = {
        title: `${session.user.name}さん`,
        body: content || "📷 画像を送信しました",
        url: `/dashboard/messages/${conversationId}`,
        type: "message"
      };

      // WebPush送信
      const subscriptions = otherParticipants.flatMap(p => p.user.pushSubscriptions);
      if (subscriptions.length > 0) {
        const { sendWebPush } = await import("@/lib/webpush");
        await sendWebPush(subscriptions, notificationPayload as any);
      }

      // ネイティブFCM送信
      const nativeTokens = otherParticipants.flatMap((p) => 
        p.user.devices.map((d) => d.pushToken).filter((t): t is string => !!t)
      );
      if (nativeTokens.length > 0) {
        const { sendNativePush } = await import("@/lib/webpush");
        await sendNativePush(nativeTokens, notificationPayload);
      }
    } catch (pushErr) {
      console.error("Failed to send Push notifications for message:", pushErr);
    }

    return NextResponse.json(newMessage);
  } catch (error) {
    console.error("[MESSAGES_CONV_POST]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
