"use client";

import { useState } from "react";

// HOMEBASE本体(FULL)を試している最中のチームが、無料プラン(FREE_ENTRY)に戻るためのボタン。
// 完全セルフサービス(2026-09-03、以前は運営問い合わせ必須だった)。無料トライアルを過ぎている場合は、
// 「直近1ヶ月分は請求が通る(日割り返金なし)、翌月以降は請求なし」というルールをAPI側が適用する
// (会費Pay側のコース解約はbilling-check cronが今月の請求締切後に自動実行、詳細はend-trial route.ts参照)。
export default function EndTrialButton({ team, onDone }: { team: any; onDone?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  if (!team || team.tier === "FREE_ENTRY") return null;

  const handleClick = async () => {
    if (!confirm("HOMEBASE本体の利用をやめて、無料プラン(入団申込み・団費管理のみ)に戻しますか？\n\n無料トライアル期間を過ぎている場合、直近1ヶ月分のお支払いはそのまま発生します(日割り返金なし)。翌月以降は請求されません。")) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/team/end-trial", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "処理に失敗しました。");
      onDone?.();
      if (data.message) alert(data.message);
      window.location.href = "/attach/admin";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "12px", textDecoration: "underline", cursor: "pointer", padding: 0, alignSelf: "flex-start" }}
      >
        無料プラン(入団申込み・団費管理のみ)に戻す
      </button>
    );
  }

  return (
    <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.03)", borderRadius: "var(--radius-md)", fontSize: "12px" }}>
      <p style={{ marginBottom: "8px" }}>HOMEBASE本体の機能(タイムライン・カレンダー・スコア等)が使えなくなります。よろしいですか？</p>
      {error && <p style={{ color: "var(--danger)", marginBottom: "8px" }}>{error}</p>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} disabled={loading} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }}>
          キャンセル
        </button>
        <button type="button" onClick={handleClick} disabled={loading} className="btn" style={{ padding: "6px 12px", fontSize: "12px", background: "var(--danger)", color: "#fff" }}>
          {loading ? "処理中..." : "無料プランに戻す"}
        </button>
      </div>
    </div>
  );
}
