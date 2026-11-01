import webpush from "web-push";
import { getEnv } from "./env";
import { signJwtRS256 } from "./edgeCrypto";

let vapidInitialized = false;

const initVapid = () => {
  if (vapidInitialized) return true;
  // NEXT_PUBLIC_* はビルド時の静的参照のみインライン化され、getEnv(動的)はWorker上で空になる。
  // 公開値のVAPID公開鍵はビルド時インラインの process.env.* をフォールバックに使う（これが無いとWeb Push全体がスキップされる）。
  const vapidPublicKey = (getEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY") || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  const vapidPrivateKey = (getEnv("VAPID_PRIVATE_KEY") || "").trim();

  if (vapidPublicKey && vapidPrivateKey) {
    try {
      webpush.setVapidDetails(
        "mailto:dummy@example.com",
        vapidPublicKey,
        vapidPrivateKey
      );
      vapidInitialized = true;
      return true;
    } catch (err) {
      console.error("Failed to set Vapid details:", err);
    }
  }
  return false;
};

// WebPush (ブラウザPWA) 用の送信処理
export const sendWebPush = async (
  subscriptions: { endpoint: string; p256dh: string; auth: string }[],
  payload: { title: string; body: string; url?: string; type?: string }
) => {
  if (!initVapid()) {
    console.warn("VAPID keys not configured, skipping push notification.");
    return;
  }

  const notificationPayload = JSON.stringify(payload);

  // 同一エンドポイントへの二重送信を防ぐ（重複購読レコードが残っていた場合の保険）
  const seenEndpoints = new Set<string>();
  const uniqueSubscriptions = subscriptions.filter((sub) => {
    if (seenEndpoints.has(sub.endpoint)) return false;
    seenEndpoints.add(sub.endpoint);
    return true;
  });

  const pushPromises = uniqueSubscriptions.map((sub) =>
    webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      notificationPayload,
      {
        headers: {
          "Urgency": "high"
        }
      }
    ).catch(err => {
      if (err.statusCode === 410) {
        console.log("Subscription is no longer valid:", sub.endpoint);
      } else {
        console.error("Error sending push notification:", err);
      }
    })
  );

  await Promise.all(pushPromises);
};

// --- Firebase Cloud Messaging (FCM) アクセストークン取得ヘルパー ---
let fcmAccessToken: string | null = null;
let tokenExpiryTime = 0;

const getFCMAccessToken = async (): Promise<string | null> => {
  const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getEnv("FIREBASE_PRIVATE_KEY");
  const projectId = getEnv("FIREBASE_PROJECT_ID");

  if (!clientEmail || !privateKey || !projectId) {
    console.warn("Firebase credentials not configured. Native push will be skipped.");
    return null;
  }

  // キャッシュがあり期限内の場合は再利用 (有効期限1時間)
  if (fcmAccessToken && Date.now() < tokenExpiryTime) {
    return fcmAccessToken;
  }

  try {
    // 改行コードのフォーマットを調整
    const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");

    // 注意: google-auth-library は Node の http に依存し Cloudflare Workers 上で
    // "http.validateHeaderName is not implemented" で落ちる。RS256 JWT を Web Crypto で
    // 自前生成し、Google の OAuth2 トークンエンドポイントに fetch で交換する。
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signJwtRS256(
      { alg: "RS256", typ: "JWT" },
      {
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      },
      formattedPrivateKey
    );

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
    });
    if (!tokenRes.ok) {
      console.error("Failed to exchange FCM JWT for access token:", tokenRes.status, await tokenRes.text().catch(() => ""));
      return null;
    }
    const credentials = (await tokenRes.json()) as { access_token?: string };
    fcmAccessToken = credentials.access_token || null;
    tokenExpiryTime = Date.now() + 3500 * 1000; // 58分後に有効期限を設定
    return fcmAccessToken;
  } catch (err) {
    console.error("Failed to authorize Firebase Service Account JWT:", err);
    return null;
  }
};

// ネイティブアプリ (FCM) 用の送信処理
export const sendNativePush = async (
  tokens: string[],
  payload: { title: string; body: string; url?: string; type?: string; callerName?: string; callType?: string }
) => {
  const projectId = getEnv("FIREBASE_PROJECT_ID");
  if (!projectId) return;

  const accessToken = await getFCMAccessToken();
  if (!accessToken) return;

  // 同一トークンへの二重送信を防ぐ（古いデバイス登録行が同じトークンで残っていると通知が2回出るため）
  const validTokens = Array.from(new Set(tokens.filter((t) => t && t.trim() !== "")));
  if (validTokens.length === 0) return;

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // 通話系（着信/着信キャンセル）は「データのみ」で送る。
  // notificationブロックを付けるとバックグラウンド時にアプリのFCMサービス(onMessageReceived)が
  // 呼ばれず、全画面着信＋鳴動ループを起動できないため（CallMessagingServiceが自前で通知を構築する）。
  const isCall = payload.type === "call" || payload.type === "call-cancel";

  const pushPromises = validTokens.map(async (token) => {
    try {
      const message: any = isCall
        ? {
            token,
            data: {
              type: payload.type || "call",
              title: payload.title || "",
              body: payload.body || "",
              url: payload.url || "/dashboard",
              callerName: payload.callerName || payload.title || "着信",
              callType: payload.callType || "audio",
            },
            android: { priority: "high" },
            apns: {
              headers: { "apns-priority": "10", "apns-push-type": "alert" },
              payload: { aps: { sound: "ringtone.caf", "content-available": 1 } },
            },
          }
        : {
            token,
            notification: { title: payload.title, body: payload.body },
            data: {
              url: payload.url || "/dashboard",
              type: payload.type || "general",
            },
            android: {
              priority: "high",
              notification: {
                sound: "default",
                channel_id: "homebase-messages-v1",
                icon: "ic_launcher",
              },
            },
            apns: {
              payload: {
                aps: { sound: "default", badge: 1, "content-available": 1 },
              },
            },
          };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`FCM send error for token ${token}:`, errorData);
      }
    } catch (err) {
      console.error("Network error while sending to FCM:", err);
    }
  });

  await Promise.all(pushPromises);
};
