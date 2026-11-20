"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

// ローカル手元確認用: 「🔑 BASE アカウントでログイン」を押したときに、どの役割の BASE アカウントとして通行証を発行するか選ぶ画面。
const ACCOUNTS = [
  {
    email: "manager1@example.com",
    roleLabel: "👔 指導者・監督（チーム全体の成績＋全機能が閲覧可）",
    name: "星野 仙一 (監督)",
  },
  {
    email: "player1@example.com",
    roleLabel: "⚾ 選手本人（PLAYER_CAN_VIEW_OWN=true により本人の成績も閲覧可）",
    name: "大谷 翔平 (#17)",
  },
  {
    email: "parent1@example.com",
    roleLabel: "👪 保護者（ひもづけたお子さんの成績を閲覧可）",
    name: "大谷 翔子 (母)",
  },
];

function DevSsoInner() {
  const params = useSearchParams();
  const aud = params.get("aud") ?? "skillbase";
  const ret = params.get("return") ?? "/auth/base/callback";
  const state = params.get("state") ?? "";

  return (
    <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 20px" }}>
      <div className="card card-glass" style={{ width: "100%", maxWidth: "480px", padding: "28px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <span className="badge badge-accent" style={{ marginBottom: "8px", display: "inline-block" }}>
            ローカル通し確認用（BASE ID 窓口シミュレータ）
          </span>
          <h1 style={{ fontSize: "20px", fontWeight: 800, margin: "4px 0 8px" }}>
            🔑 BASE アカウントを選択してログイン
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
            選んだアカウントで本物の署名つき通行証（<code>baseTicket</code>）を発行し、
            <code>/auth/base/callback</code> の検証を通してログインします。
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {ACCOUNTS.map((a) => {
            const href = `/api/id/sso?aud=${encodeURIComponent(aud)}&return=${encodeURIComponent(ret)}&state=${encodeURIComponent(state)}&email=${encodeURIComponent(a.email)}`;
            return (
              <a
                key={a.email}
                href={href}
                className="card"
                style={{
                  display: "block",
                  padding: "14px 16px",
                  textDecoration: "none",
                  color: "var(--text-main)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 700, marginBottom: "3px" }}>
                  {a.roleLabel}
                </div>
                <div style={{ fontSize: "15px", fontWeight: 800 }}>{a.name}</div>
              </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function DevSsoPage() {
  return (
    <Suspense fallback={null}>
      <DevSsoInner />
    </Suspense>
  );
}
