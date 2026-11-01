import PusherClient from "pusher-js";
import { getEnv } from "./env";
import { md5Hex, hmacSha256Hex } from "./edgeCrypto";

// サーバー側の Pusher 送信。
// 注意: 公式 `pusher` Node SDK は Node の http モジュールに依存しており Cloudflare Workers 上で
// "PusherRequestError: Request failed with an error"（http.validateHeaderName 未実装）で落ちる。
// そのため Pusher REST API を fetch + 自前署名（MD5 + HMAC-SHA256）で直接叩く。
async function serverPusherTrigger(channel: string, event: string, data: unknown): Promise<void> {
  const appId = getEnv("PUSHER_APP_ID");
  const key = getEnv("NEXT_PUBLIC_PUSHER_KEY") || process.env.NEXT_PUBLIC_PUSHER_KEY || "";
  const secret = getEnv("PUSHER_SECRET");
  const cluster = getEnv("NEXT_PUBLIC_PUSHER_CLUSTER") || process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "";

  if (!appId || !key || !secret || !cluster) {
    console.error("[Pusher] credentials missing", { hasAppId: !!appId, hasKey: !!key, hasSecret: !!secret, hasCluster: !!cluster });
    throw new Error("Pusher credentials are not fully configured on the server.");
  }

  const body = JSON.stringify({
    name: event,
    channel,
    data: typeof data === "string" ? data : JSON.stringify(data),
  });
  const bodyMd5 = md5Hex(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = `/apps/${appId}/events`;
  // 署名対象のクエリはアルファベット順（auth_key < auth_timestamp < auth_version < body_md5）
  const params = `auth_key=${key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${bodyMd5}`;
  const signature = await hmacSha256Hex(secret, `POST\n${path}\n${params}`);
  const url = `https://api-${cluster}.pusher.com${path}?${params}&auth_signature=${signature}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pusher trigger failed (${res.status}): ${text}`);
  }
}

// 既存の `pusherServer.trigger(channel, event, data)` 呼び出しをそのまま使えるように同じ形で公開。
export const pusherServer = {
  trigger: serverPusherTrigger,
};

// ユーザー専用の非公開チャンネル名。購読には /api/pusher/auth での本人確認が必須（他人のチャンネルは購読できない）。
export const userChannelName = (userId: string) => `private-user-${userId}`;

// Pusher の非公開チャンネル購読の署名（auth）を作る。
export async function signPusherChannelAuth(socketId: string, channelName: string): Promise<string> {
  const key = getEnv("NEXT_PUBLIC_PUSHER_KEY") || process.env.NEXT_PUBLIC_PUSHER_KEY || "";
  const secret = getEnv("PUSHER_SECRET");
  if (!key || !secret) throw new Error("Pusher credentials are not fully configured on the server.");
  return `${key}:${await hmacSha256Hex(secret, `${socketId}:${channelName}`)}`;
}

// クライアントサイド用 Pusher クライアント初期化関数 (SSR対応のためwindow存在チェックを行う)
let pusherClientInstance: PusherClient | null = null;

export const getPusherClient = (): PusherClient | null => {
  if (typeof window === "undefined") return null;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY || "a4c5cb3336eaca6ce7fb";
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap3";

  if (!pusherClientInstance) {
    pusherClientInstance = new PusherClient(
      key,
      {
        cluster: cluster,
        forceTLS: true,
        // 非公開チャンネル(private-*)の購読時に、サーバーで本人確認してから署名をもらう
        channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
      }
    );
  }
  return pusherClientInstance;
};
