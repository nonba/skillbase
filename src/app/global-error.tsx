"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError Boundary]", error);

    // デプロイ直後のバッチ不一致や一時的なエラーの場合、1回だけ自動リロードして最新版を取得
    const RECOVER_KEY = "auto_reload_attempted";
    const lastAttempt = sessionStorage.getItem(RECOVER_KEY);
    const now = Date.now();

    if (!lastAttempt || now - parseInt(lastAttempt, 10) > 15000) {
      sessionStorage.setItem(RECOVER_KEY, now.toString());
      window.location.reload();
    }
  }, [error]);

  const handleRetry = () => {
    sessionStorage.removeItem("auto_reload_attempted");
    window.location.reload();
  };

  const handleGoToLogin = () => {
    sessionStorage.removeItem("auto_reload_attempted");
    window.location.href = "/login";
  };

  return (
    <html lang="ja">
      <body style={{ background: "#0f172a", color: "#f8fafc", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0, padding: "20px" }}>
        <div style={{ textAlign: "center", padding: "24px", maxWidth: "420px", background: "rgba(30, 41, 59, 0.8)", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.1)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚠️</div>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "12px", color: "#f8fafc" }}>
            通信エラーが発生しました
          </h2>
          <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "24px", lineHeight: "1.6" }}>
            ページの読み込みに失敗しました。一時的なネットワークエラー、またはログインセッションが切れた可能性があります。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              onClick={handleRetry}
              style={{
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                padding: "12px 20px",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: "bold",
                cursor: "pointer",
                width: "100%"
              }}
            >
              もう一度試す
            </button>
            <button
              onClick={handleGoToLogin}
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                padding: "12px 20px",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                width: "100%"
              }}
            >
              ログイン画面へ戻る
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
