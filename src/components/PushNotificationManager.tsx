"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

// 端末固有のIDをlocalStorageに永続化する。
// 同一アカウントを複数台の端末（例: 会社用/個人用スマホ）で使う場合、
// ユーザーIDだけでdeviceIdを組み立てるとプラットフォームが同じ端末同士で
// deviceIdが衝突し、後から起動した端末のトークンで上書きされてしまう。
const getLocalDeviceUuid = (): string => {
  if (typeof window === "undefined") return "unknown";
  const STORAGE_KEY = "homebase_device_uuid";
  let uuid = window.localStorage.getItem(STORAGE_KEY);
  if (!uuid) {
    uuid = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, uuid);
  }
  return uuid;
};

const STORAGE_KEY_DISABLED = "homebase_push_user_disabled";

export function PushNotificationManager({ headless = false }: { headless?: boolean } = {}) {
  const { data: session } = useSession();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const native = typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform();
    setIsNative(!!native);

    // ユーザーが手動でオフに設定している場合
    const isUserDisabled = typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY_DISABLED) === "true";

    if (native) {
      setIsSupported(true);
      if (isUserDisabled) {
        setIsSubscribed(false);
        setLoading(false);
      } else {
        checkNativeSubscription();
        setupNativeNotificationHandlers();
      }
    } else if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      if (isUserDisabled) {
        setIsSubscribed(false);
        setLoading(false);
      } else {
        checkWebSubscription();
      }
    } else {
      setLoading(false);
    }
  }, []);

  // --- ネイティブアプリ用のハンドラーとチャンネル設定 ---
  const setupNativeNotificationHandlers = async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      // 1. Android用の通知チャンネルを再作成（v1: HOMEBASE改名。旧strike-*チャンネルは削除して移行）
      if ((window as any).Capacitor.getPlatform() === "android") {
        // 古いチャンネルをすべて削除
        const oldIds = ["strike-calls", "strike-calls-v2", "strike-calls-v3", "strike-messages", "strike-messages-v2", "strike-messages-v3"];
        for (const id of oldIds) {
          try { await PushNotifications.deleteChannel({ id }); } catch (e) {}
        }

        // 通話着信チャネル：カスタム着信音（call_ringtone.wav）を使用、重要度MAX
        await PushNotifications.createChannel({
          id: "homebase-calls-v1",
          name: "HOMEBASE 通話着信",
          description: "通話とビデオ通話の着信通知用のチャンネル",
          importance: 5,
          sound: "call_ringtone", // android/app/src/main/res/raw/call_ringtone.wav
          vibration: true,
          visibility: 1
        });

        // 通常メッセージチャネル
        await PushNotifications.createChannel({
          id: "homebase-messages-v1",
          name: "HOMEBASE メッセージ",
          description: "通常のメッセージ通知用のチャンネル",
          importance: 4,
          sound: "default",
          vibration: true,
          visibility: 1
        });
      }

      // 2. 通知アクション（タップ）時の画面遷移
      // 注意: 正式なイベント名は "pushNotificationActionPerformed"。
      // 以前は "notificationActionPerformed"（存在しないイベント）を購読していたため
      // タップしても遷移せず、アプリが前回の画面のまま開くバグがあった。
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        console.log("Notification action performed", JSON.stringify(action));
        const targetUrl = action.notification.data?.url;
        if (!targetUrl) return;

        // すでにアプリ内で着信画面が出ている時に着信通知をタップした場合、
        // ページ遷移（リロード）すると着信状態が壊れるので何もしない
        if (targetUrl.includes("incomingCall=true") && (window as any).__homebaseCallActive) {
          console.log("Call already active in-app, skipping navigation");
          return;
        }

        console.log("Redirecting to: " + targetUrl);
        window.location.href = targetUrl;
      });

      // 3. アプリ起動時に自動で通知を登録（初回のみ）
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive === "granted") {
        // 既に許可済みならすぐ登録
        autoRegisterNativeToken();
      } else if (permission.receive === "prompt") {
        // まだ許可を求めていない場合は自動で許可ダイアログを表示
        const result = await PushNotifications.requestPermissions();
        if (result.receive === "granted") {
          autoRegisterNativeToken();
        }
      }

    } catch (err) {
      console.error("Failed to setup native notification channels/handlers:", err);
    }
  };

  // アプリ起動時の自動トークン登録
  const autoRegisterNativeToken = async () => {
    if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY_DISABLED) === "true") {
      console.log("User explicitly disabled notifications, skipping autoRegisterNativeToken");
      return;
    }
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.register();

      await PushNotifications.addListener("registration", async (token) => {
        console.log("Auto-registration token: " + token.value);
        const platform = (window as any).Capacitor.getPlatform();
        await fetch("/api/user/update-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: token.value,
            deviceId: `native-${platform}-${getLocalDeviceUuid()}`,
            userAgent: `HOMEBASE ${platform === "android" ? "Android" : "iOS"} App`
          }),
        });
        setIsSubscribed(true);
        console.log("Auto-registered push token successfully");
      });
    } catch (err) {
      console.error("Auto register native token failed:", err);
    }
  };

  // --- Web（ブラウザ）用の購読確認 ---
  const checkWebSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Service Worker error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- ネイティブ（アプリ）用の購読確認 ---
  // OSの通知許可があるだけでは「オン」とはみなさない。許可を消しても
  // OS側の許可自体は残るため、サーバー側に実際にトークンが登録されているかで判定する。
  const checkNativeSubscription = async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") {
        setIsSubscribed(false);
        return;
      }

      const platform = (window as any).Capacitor.getPlatform();
      const deviceId = `native-${platform}-${getLocalDeviceUuid()}`;
      const res = await fetch(`/api/user/update-device?deviceId=${encodeURIComponent(deviceId)}`);
      if (res.ok) {
        const data = await res.json();
        setIsSubscribed(!!data.subscribed);
      } else {
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error("Native push permission check error:", error);
    } finally {
      setLoading(false);
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const cleaned = base64String.replace(/[^A-Za-z0-9\-_]/g, "");
    const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
    const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const getVapidPublicKey = async (): Promise<string> => {
    try {
      const res = await fetch("/api/webpush/public-key", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.publicKey) return data.publicKey.trim();
      }
    } catch (e) {
      console.warn("VAPID public key fetch from API failed, using env var:", e);
    }
    const key = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
    return key;
  };

  // --- 通知登録の実行（Web / アプリ共通分岐） ---
  const subscribeToPush = async () => {
    setLoading(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY_DISABLED);
      }

      if (isNative) {
        // ネイティブアプリ用の登録処理
        const { PushNotifications } = await import("@capacitor/push-notifications");
        
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive !== "granted") {
          permission = await PushNotifications.requestPermissions();
        }

        if (permission.receive === "granted") {
          // デバイス登録（FCMトークン取得のためのトリガー）
          await PushNotifications.register();

          // トークン取得時のイベントリスナー
          await PushNotifications.addListener("registration", async (token) => {
            console.log("Push registration success, token: " + token.value);
            
            const platform = (window as any).Capacitor.getPlatform();
            const deviceId = `native-${platform}-${getLocalDeviceUuid()}`;
            const userAgent = `HOMEBASE ${platform === 'android' ? 'Android' : 'iOS'} App`;

            // サーバーのUserDeviceテーブルにデバイストークンを保存
            const res = await fetch("/api/user/update-device", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: token.value,
                deviceId: deviceId,
                userAgent: userAgent
              }),
            });

            if (res.ok) {
              setIsSubscribed(true);
            } else {
              throw new Error("サーバーへのデバイストークン保存に失敗しました。");
            }
          });

          // エラーリスナー
          await PushNotifications.addListener("registrationError", (error: any) => {
            console.error("Push registration error: ", error);
            alert("プッシュ通知のデバイス登録に失敗しました。");
          });
        } else {
          throw new Error("通知権限が拒否されています。iPhoneの設定から通知を許可してください。");
        }
      } else {
        // ブラウザ（PWA）用の登録処理
        if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
          throw new Error("お使いのブラウザはプッシュ通知に対応していません。");
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("通知権限が拒否されています。サイトの設定から通知を「許可」にしてください。");
        }

        const registration = await navigator.serviceWorker.ready;
        const vapidPublicKey = await getVapidPublicKey();
        if (!vapidPublicKey) {
          throw new Error("サーバー認証キー（VAPID公開鍵）の設定が空です。");
        }

        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await existing.unsubscribe();
        }

        let subscription: PushSubscription;
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
        } catch (subErr: any) {
          const msg: string = subErr?.message || String(subErr);
          if (msg.includes("applicationServerKey") || msg.includes("InvalidStateError")) {
            throw new Error("通知の登録に失敗しました。ブラウザの通知設定をリセットしてから再度お試しください。");
          }
          throw new Error(`通知の登録に失敗しました: ${msg}`);
        }

        const saveRes = await fetch("/api/webpush/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        });

        if (!saveRes.ok) {
          throw new Error("サーバーへの通知設定の保存に失敗しました。");
        }

        setIsSubscribed(true);
      }
    } catch (error: any) {
      console.error("Push subscribe failed:", error);
      alert(`プッシュ通知の登録に失敗しました。\n\n${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  // --- 通知解除の実行 ---
  const unsubscribeFromPush = async () => {
    setLoading(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_DISABLED, "true");
      }
      if (isNative) {
        // アプリ側では、サーバーのトークンを削除・空にする
        const platform = (window as any).Capacitor?.getPlatform?.() || "ios";
        await fetch("/api/user/update-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "",
            deviceId: `native-${platform}-${getLocalDeviceUuid()}`,
            action: "unsubscribe",
          }),
        });
        setIsSubscribed(false);
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await fetch("/api/webpush/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        }
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error("Push unsubscribe failed:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isSupported || !session) return null;
  // headless: 自動登録のuseEffect/ロジックだけ動かし、可視UIカードは出さない（レイアウト全体マウント用）
  if (headless) return null;

  const isBlocked =
    !isNative &&
    typeof window !== "undefined" &&
    window.Notification?.permission === "denied";

  return (
    <div
      className="card"
      style={{
        padding: "16px",
        marginTop: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
            プッシュ通知
          </h3>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "13px",
              color: "var(--text-muted)",
            }}
          >
            新しい連絡やアンケートが作成された際に通知を受け取ります。
          </p>
        </div>

        <button
          onClick={isSubscribed ? unsubscribeFromPush : subscribeToPush}
          disabled={loading || isBlocked}
          className={isSubscribed ? "btn btn-secondary" : "btn btn-primary"}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            minWidth: "100px",
            opacity: isBlocked ? 0.5 : 1,
          }}
        >
          {loading ? "処理中..." : isSubscribed ? "オフにする" : "オンにする"}
        </button>
      </div>

      {isBlocked && (
        <div
          style={{
            marginTop: "8px",
            padding: "16px",
            background: "rgba(255, 159, 67, 0.1)",
            border: "1px solid var(--warning)",
            borderRadius: "var(--radius-sm)",
            fontSize: "13px",
            color: "#d35400",
          }}
        >
          <strong style={{ display: "block", marginBottom: "8px", fontSize: "14px" }}>
            ⚠️ 通知がブラウザによってブロックされています
          </strong>
          <p style={{ margin: "0 0 8px 0" }}>
            過去に「許可しない」を選択したか、ブラウザのスパム防止機能により自動でブロックされています。
            <br />
            通知を受け取るには、以下の手順で手動でブロックを解除してください。
          </p>
          <ol
            style={{
              margin: "0",
              paddingLeft: "20px",
              lineHeight: "1.6",
              fontWeight: 600,
            }}
          >
            <li>ブラウザの右上メニュー（︙）から「設定」を開く</li>
            <li>「サイトの設定」 ＞ 「通知」 をタップ</li>
            <li>
              「ブロックされているサイト」からこのサイトを選び、「許可」に変更する
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
