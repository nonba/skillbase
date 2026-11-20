"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

// SKILLBASE のログイン画面（2026-11-20 更新）。
// オーナー決定: SKILLBASE が自前のログインで新規ユーザーを作らない形にし、ログインは BASE アカウントだけに統一。

function LoginCard() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="card card-glass" style={{ width: "100%", maxWidth: "450px", padding: "32px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <span className="badge badge-accent" style={{ marginBottom: "12px" }}>BASE Series</span>
        <h1 style={{ fontSize: "clamp(20px, 6.5vw, 26px)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
          ⚡ SKILLBASE <span style={{ color: "var(--primary)" }}>ログイン</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "8px", lineHeight: 1.7 }}>
          HOMEBASE・SCOREBASE・SKILLBASE 共通の<br />
          <strong>BASE アカウント</strong>でログインします
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(255, 71, 87, 0.1)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            fontSize: "13px",
            marginBottom: "18px",
            fontWeight: 600,
            lineHeight: 1.6,
          }}
        >
          ログインの確認ができませんでした。もう一度「BASE アカウントでログイン」からお試しください。
        </div>
      )}

      <a
        id="base-login-btn"
        href="/api/auth/base/start?mode=login"
        className="btn btn-primary"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          textDecoration: "none",
          height: "52px",
          padding: "0 16px",
          fontSize: "15px",
          fontWeight: 800,
        }}
      >
        🔑 BASE アカウントでログイン
      </a>

      <div
        style={{
          marginTop: "24px",
          padding: "14px 16px",
          background: "rgba(0, 0, 0, 0.02)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          fontSize: "12px",
          color: "var(--text-muted)",
          lineHeight: 1.7,
        }}
      >
        <div style={{ fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
          💡 BASE アカウントについて
        </div>
        SKILLBASE では独自のアカウント登録は行わず、BASE シリーズ共通のアカウントでそのままご利用いただけます。
        パスワードをお忘れの場合は、チームの管理者または BASE アカウントの窓口にてご確認ください。
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 20px" }}>
      <Suspense fallback={<div>読み込み中...</div>}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
