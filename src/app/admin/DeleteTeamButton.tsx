"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleDelete = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/teams/${teamId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "削除に失敗しました。");
      router.refresh();
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
        style={{ background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}
      >
        削除...
      </button>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", padding: "10px", minWidth: "220px" }}>
      <p style={{ fontSize: "11px", marginBottom: "6px" }}>
        確認のためチーム名「<strong>{teamName}</strong>」を入力:
      </p>
      <input
        type="text"
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        disabled={loading}
        placeholder="チーム名"
        style={{ width: "100%", padding: "6px 8px", fontSize: "12px", marginBottom: "6px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text-main)" }}
      />
      {error && <p style={{ fontSize: "11px", color: "var(--danger)", marginBottom: "6px" }}>{error}</p>}
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          type="button"
          onClick={() => { setOpen(false); setConfirmName(""); setError(""); }}
          disabled={loading}
          style={{ flex: 1, padding: "6px", fontSize: "12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text-main)", cursor: "pointer" }}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading || confirmName.trim() !== teamName}
          style={{ flex: 1, padding: "6px", fontSize: "12px", border: "none", borderRadius: "var(--radius-sm)", background: "var(--danger)", color: "#fff", cursor: loading || confirmName.trim() !== teamName ? "not-allowed" : "pointer", opacity: loading || confirmName.trim() !== teamName ? 0.6 : 1 }}
        >
          {loading ? "削除中..." : "完全に削除する"}
        </button>
      </div>
    </div>
  );
}
