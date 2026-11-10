"use client";

import { useEffect, useState } from "react";

// 「BASE アカウントとつなぐ」(試作・2026-11-11)。SKILLBASE にログイン中の人が、BASE アカウント(HOMEBASE=土台)と結ぶ。
// 結んだあとは、ログイン画面の「BASE アカウントでログイン」で入れる。自動では結ばない(本人が、土台のログインを確かめたときだけ)。
export default function BaseLinkPage() {
  const [linked, setLinked] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/base/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { linked?: boolean }) => setLinked(Boolean(j.linked)))
      .catch(() => setLinked(null));
  }, []);

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>BASE アカウントとつなぐ</h1>
      <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, marginBottom: 16 }}>
        BASE アカウント（HOMEBASE・SCOREBASE と共通のアカウント）とつなぐと、ログイン画面の「BASE アカウントでログイン」で、SKILLBASE に入れます。
        つなぐときは、BASE アカウントの、ログインの確認があります。
      </p>
      {linked === true && <p style={{ color: "#047857", fontWeight: 800 }}>つないであります。</p>}
      {linked === false && (
        <a href="/api/auth/base/start?mode=link" className="btn btn-primary" style={{ display: "inline-block", padding: "10px 18px", fontWeight: 800 }}>
          🔗 BASE アカウントとつなぐ
        </a>
      )}
      {linked === null && <p style={{ color: "#64748b", fontSize: 13 }}>確認しています…</p>}
    </div>
  );
}
