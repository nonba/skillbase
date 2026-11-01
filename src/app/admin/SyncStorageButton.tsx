"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncStorageButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    if (!confirm("Cloudflare R2上の全ファイルを実際に数えて、全チームのストレージ使用量を再計算・上書きしますか？")) {
      return;
    }
    
    setIsSyncing(true);
    try {
      const res = await fetch("/api/admin/storage/sync", {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        alert(`ストレージの同期が完了しました（${data.teamCount}チーム更新）`);
        router.refresh();
      } else {
        alert("エラーが発生しました: " + (data.error || ""));
      }
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <button 
      onClick={handleSync} 
      disabled={isSyncing}
      style={{
        background: "var(--primary)",
        color: "#fff",
        border: "none",
        padding: "8px 16px",
        borderRadius: "var(--radius-sm)",
        fontWeight: "bold",
        cursor: isSyncing ? "not-allowed" : "pointer",
        opacity: isSyncing ? 0.7 : 1
      }}
    >
      {isSyncing ? "同期中..." : "🔄 ストレージ再計算（同期）"}
    </button>
  );
}
