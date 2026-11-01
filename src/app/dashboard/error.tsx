"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError Boundary]", error);

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
    <div style={{ padding: "40px 20px", textAlign: "center", maxWidth: "450px", margin: "60px auto" }}>
      <div className="card card-glass" style={{ padding: "28px", borderRadius: "16px" }}>
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
        <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "var(--text-main)" }}>
          ダッシュボードの表示エラー
        </h2>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px", lineHeight: 1.6 }}>
          一時的なアクセスエラーが発生しました。再試行するか、ログイン画面へ戻ってください。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            className="btn btn-primary"
            onClick={handleRetry}
            style={{ width: "100%", height: "44px", fontSize: "14px", fontWeight: 700 }}
          >
            もう一度読み込む
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleGoToLogin}
            style={{ width: "100%", height: "44px", fontSize: "14px" }}
          >
            ログイン画面へ戻る
          </button>
        </div>
      </div>
    </div>
  );
}
