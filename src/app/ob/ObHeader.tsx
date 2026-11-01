"use client";

import { signOut } from "next-auth/react";

export default function ObHeader() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--surface)",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-main)" }}>
        🎓 OBページ
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{ background: "rgba(255, 71, 87, 0.1)", color: "var(--danger)", border: "1px solid var(--danger)", padding: "6px 14px", borderRadius: "var(--radius-sm)", fontSize: "13px", cursor: "pointer" }}
      >
        ログアウト
      </button>
    </div>
  );
}
