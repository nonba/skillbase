"use client";

import { useEffect, useState } from "react";

export default function AppUpdateNotifier() {
  const [hasUpdate, setHasUpdate] = useState(false);

  const checkVersion = async () => {
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const serverVersion = data.version;

      if (!serverVersion) return;

      const stored = sessionStorage.getItem("homebase_app_version");
      if (!stored) {
        sessionStorage.setItem("homebase_app_version", serverVersion);
      } else if (stored !== serverVersion) {
        setHasUpdate(true);
      }
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    checkVersion();

    // 5分ごとにサーバーの最新バージョンをチェック
    const interval = setInterval(checkVersion, 5 * 60 * 1000);

    // アプリ復帰時（バックグラウンド→フォアグラウンド）にもバージョンチェック
    const handleFocus = () => checkVersion();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);

  const handleUpdate = async () => {
    try {
      if (typeof window !== "undefined" && "caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      /* noop */
    }
    sessionStorage.removeItem("homebase_app_version");
    window.location.reload();
  };

  if (!hasUpdate) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 999999,
        width: "90%",
        maxWidth: "400px",
        background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)",
        color: "#ffffff",
        padding: "12px 16px",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(79, 70, 229, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 600 }}>
        ✨ 新しいバージョンが利用可能です
      </div>
      <button
        onClick={handleUpdate}
        style={{
          background: "#ffffff",
          color: "#4f46e5",
          border: "none",
          padding: "6px 14px",
          borderRadius: "8px",
          fontWeight: 700,
          fontSize: "12px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        今すぐ更新
      </button>
    </div>
  );
}
