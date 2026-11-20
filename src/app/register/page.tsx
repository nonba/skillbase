"use client";

import Link from "next/link";

// SKILLBASE は自前のログインで新規ユーザーを作らない（2026-11-20 更新）。
// /register にアクセスした場合は BASE アカウントでのログインへ案内する。

export default function RegisterPage() {
  return (
    <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 20px" }}>
      <div className="card card-glass" style={{ width: "100%", maxWidth: "450px", padding: "32px 24px", textAlign: "center" }}>
        <span className="badge badge-accent" style={{ marginBottom: "12px" }}>BASE Series</span>
        <h1 style={{ fontSize: "clamp(19px, 5.5vw, 24px)", fontWeight: 800, marginBottom: "12px" }}>
          BASE アカウントでご利用いただけます
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.8, marginBottom: "24px" }}>
          SKILLBASE では独自のアカウント作成は不要です。<br />
          HOMEBASE・SCOREBASE と共通の <strong>BASE アカウント</strong>でログインしてすぐにご利用いただけます。
        </p>

        <a
          href="/api/auth/base/start?mode=login"
          className="btn btn-primary"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            textDecoration: "none",
            height: "50px",
            padding: "0 16px",
            fontWeight: 800,
          }}
        >
          🔑 BASE アカウントでログイン
        </a>

        <div style={{ marginTop: "20px", fontSize: "13px" }}>
          <Link href="/login" style={{ color: "var(--primary)", fontWeight: 700 }}>
            ログイン画面へ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
