import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { pusherServer, userChannelName } from "@/lib/pusher";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const body = await req.json();
    const { conversationId, type, targetUserId, data } = body;

    if (!conversationId || !type || !targetUserId) {
      return NextResponse.json({ error: "必須パラメータが不足しています。" }, { status: 400 });
    }

    // 一時デバッグ: 通話シグナルの流れを確認する（応答/拒否が届いているか切り分け用）
    // 発信側・受信側の両方が、その会話の参加者であることを確認する（任意のユーザーへの着信・信号送信を防ぐ）
    const participants = await db.conversationParticipant.findMany({
      where: { conversationId: String(conversationId), userId: { in: [session.user.id, String(targetUserId)] } },
      select: { userId: true },
    });
    const participantIds = new Set(participants.map((p) => p.userId));
    if (!participantIds.has(session.user.id) || !participantIds.has(String(targetUserId))) {
      return NextResponse.json({ error: "この通話は許可されていません。" }, { status: 403 });
    }

    console.log(`[CALL-SIGNAL] type=${type} from=${session.user.id}(${session.user.name}) to=${targetUserId}`);

    // 送信先のユーザーチャンネルに通話シグナリングイベントを配信する
    await pusherServer.trigger(userChannelName(String(targetUserId)), "call-signal", {
      senderId: session.user.id,
      senderName: session.user.name || "不明なユーザー",
      conversationId,
      type, // 'incoming-call' | 'accept-call' | 'reject-call' | 'hangup' | 'call-offer' | 'call-answer' | 'ice-candidate'
      data, // SDP オファー/アンサー、または ICE Candidate などの実データ
    });

    // 着信時 (incoming-call) の場合、相手にWebPush通知を送る（アプリを閉じている場合の通知）
    // ただし発信側ハートビートによる再送(isRetry)では通知を重複送信しない（Pusher配信のみ）。
    if (type === "incoming-call" && !data?.isRetry) {
      // 完全に独立した try-catch で囲み、WebPushエラーが通話接続自体を妨げないようにする
      try {
        const targetUser = await db.user.findUnique({
          where: { id: targetUserId },
          include: { 
            pushSubscriptions: true,
            devices: {
              where: {
                pushToken: { not: null }
              }
            }
          }
        });
        
        const callLabel = data?.callType === "video" ? "ビデオ通話" : "音声通話";
        // 通知URLに着信情報をすべて含める（タップ時に着信画面を即復元するため）
        const callUrl = `/dashboard/messages/${conversationId}?incomingCall=true&callerId=${session.user.id}&callerName=${encodeURIComponent(session.user.name || "メンバー")}&callType=${data?.callType || "audio"}`;
        const notificationPayload = {
          title: `${session.user.name || "メンバー"}さんから着信`,
          body: `📞 ${callLabel}がかかってきています。タップして応答してください。`,
          url: callUrl,
          type: "call",
          callerName: `${session.user.name || "メンバー"}さん`,
          callType: data?.callType || "audio",
        };

        // WebPush送信
        if (targetUser && targetUser.pushSubscriptions.length > 0) {
          const { sendWebPush } = await import("@/lib/webpush");
          await sendWebPush(targetUser.pushSubscriptions, notificationPayload as any);
        }

        // ネイティブFCM送信
        if (targetUser && targetUser.devices.length > 0) {
          const { sendNativePush } = await import("@/lib/webpush");
          const nativeTokens = targetUser.devices
            .map((d) => d.pushToken)
            .filter((t): t is string => !!t);
          await sendNativePush(nativeTokens, notificationPayload);
        }
      } catch (pushErr) {
        console.error("Failed to send WebPush for incoming call:", pushErr);
      }
    }

    // 発信者が切った/拒否された場合、相手端末のネイティブ着信音を止めるためのFCMを送る
    if (type === "hangup" || type === "reject-call") {
      try {
        const targetUser = await db.user.findUnique({
          where: { id: targetUserId },
          include: { devices: { where: { pushToken: { not: null } } } },
        });
        if (targetUser && targetUser.devices.length > 0) {
          const { sendNativePush } = await import("@/lib/webpush");
          const nativeTokens = targetUser.devices
            .map((d) => d.pushToken)
            .filter((t): t is string => !!t);
          await sendNativePush(nativeTokens, { title: "", body: "", type: "call-cancel" });
        }
      } catch (cancelErr) {
        console.error("Failed to send call-cancel push:", cancelErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Signaling API error:", error);
    return NextResponse.json({
      error: `シグナリング送信エラー: ${error.message || error}`,
    }, { status: 500 });
  }
}
