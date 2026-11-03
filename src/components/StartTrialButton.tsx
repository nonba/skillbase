"use client";

import { useState } from "react";
import { isNativeApp } from "@/lib/platform";

// FREE_ENTRY(無料の入団管理機能のみ)チームが「SKILLBASEを試す」を選ぶボタン。
// 設定画面・ロック画面(FreeEntryPaywall)など複数箇所から使う共通部品(2026-09-02切り出し)。
// 2026-09-06: App Store審査(Guideline 3.1.1)対応でネイティブアプリでは非表示(Web版のみ表示)。
// プラン契約(=外部決済である会費Payにつながる操作)はWeb版でのみ行う方針。
export default function StartTrialButton({ onDone, label = "🔓 SKILLBASE本体を試す" }: { onDone?: () => void; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isNativeApp()) return null;

  const handleClick = async () => {
    if (!confirm("SKILLBASE本体の全機能を試しますか？登録月と翌月は無料でご利用いただけます。")) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/team/start-trial", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "処理に失敗しました。");
      onDone?.();
      window.location.href = "/dashboard";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={handleClick} disabled={loading}>
        {loading ? "処理中..." : label}
      </button>
      {error && <div style={{ color: "var(--danger)", fontSize: "12px", marginTop: "8px" }}>{error}</div>}
    </div>
  );
}
