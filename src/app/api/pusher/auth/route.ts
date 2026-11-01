import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { signPusherChannelAuth, userChannelName } from "@/lib/pusher";

export const dynamic = "force-dynamic";

// Pusher非公開チャンネルの購読認可。
// ログイン中のユーザー本人のチャンネル(private-user-<自分のID>)だけ署名を返す。他人のチャンネルは403。
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const socketId = String(form?.get("socket_id") || "");
  const channelName = String(form?.get("channel_name") || "");

  if (!/^\d+\.\d+$/.test(socketId) || channelName !== userChannelName(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const auth = await signPusherChannelAuth(socketId, channelName);
  return NextResponse.json({ auth });
}
