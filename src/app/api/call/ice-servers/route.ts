import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getEnv } from "@/lib/env";

// TURN未設定時・API障害時のフォールバック（信頼性の高いグローバルSTUN群）
const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.services.mozilla.com:3478" },
];

// Cloudflare Realtime (Calls) TURN の一時認証情報を発行して返す。
// 認証情報は短命（TTL付き）なので、通話のたびにここで取得する。
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const keyId = (getEnv("CLOUDFLARE_TURN_KEY_ID") || "").trim();
    const apiToken = (getEnv("CLOUDFLARE_TURN_API_TOKEN") || "").trim();

    // 環境変数が未設定の場合は従来どおりSTUNのみで返す（機能フラグを兼ねる）
    if (!keyId || !apiToken) {
      return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, turn: false });
    }

    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        // 1通話に十分な有効期限（2時間）
        body: JSON.stringify({ ttl: 7200 }),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Cloudflare TURN credential error (${res.status}):`, errText);
      return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, turn: false });
    }

    const data = await res.json();
    // レスポンスは { iceServers: [{ urls, username, credential }] } 形式（配列/単体の揺れを吸収）
    const servers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];

    return NextResponse.json({ iceServers: servers, turn: true });
  } catch (error: any) {
    console.error("ICE servers fetch error:", error);
    return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, turn: false });
  }
}
