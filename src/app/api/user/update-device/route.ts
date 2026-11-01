import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// この端末(deviceId)にサーバー側で有効なプッシュトークンが登録されているかを返す。
// OSの通知許可の有無ではなく、実際にサーバーへ登録済みかどうかで判定するために使う。
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ error: "deviceIdが不足しています。" }, { status: 400 });
    }

    const device = await db.userDevice.findUnique({
      where: {
        userId_deviceId: {
          userId: session.user.id,
          deviceId,
        },
      },
    });

    return NextResponse.json({ subscribed: !!device?.pushToken });
  } catch (error: any) {
    console.error("Get device status error:", error);
    return NextResponse.json(
      { error: `デバイス状態取得エラー: ${error.message || error}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { token, deviceId, userAgent, action } = await req.json();

    const targetDeviceId = deviceId || `native-device-${session.user.id}`;

    // オフ(通知解除)の処理
    if (action === "unsubscribe" || !token) {
      await db.userDevice.deleteMany({
        where: {
          userId: session.user.id,
          deviceId: targetDeviceId,
        },
      });
      return NextResponse.json({ success: true, unsubscribed: true });
    }

    // デバイストークンを保存する
    await db.userDevice.upsert({
      where: {
        userId_deviceId: {
          userId: session.user.id,
          deviceId: targetDeviceId,
        },
      },
      update: {
        pushToken: token,
        userAgent: userAgent || "Native iOS/Android App",
        lastActive: new Date(),
      },
      create: {
        userId: session.user.id,
        deviceId: targetDeviceId,
        pushToken: token,
        userAgent: userAgent || "Native iOS/Android App",
        lastActive: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update device token error:", error);
    return NextResponse.json(
      { error: `トークン更新エラー: ${error.message || error}` },
      { status: 500 }
    );
  }
}
