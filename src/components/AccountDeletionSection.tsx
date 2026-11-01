"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

// アカウント削除UI(危険な操作)。HOMEBASE本体のマイページ(/dashboard/profile)と、
// Attachエリアの設定管理ハブ(/attach/settings)の両方から同じ挙動で使えるよう共通化した。
// FREE_ENTRYチームの利用者が本体側のBottomNav(有料機能ペイウォールだらけ)に迷い込まずに
// アカウント削除へたどり着けるようにするため(2026-09-05、オーナー指摘を受けて)。
export default function AccountDeletionSection() {
  const { data: session } = useSession();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "アカウントの削除に失敗しました。");

      await signOut({ callbackUrl: "/" });
    } catch (err: any) {
      setDeleteError(err.message);
      setDeleteLoading(false);
    }
  };

  return (
    <div className="card" style={{ border: "1px solid var(--danger)", background: "rgba(255, 71, 87, 0.03)" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--danger)", marginBottom: "8px" }}>⚠️ アカウントを削除する</h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: 1.7 }}>
        アカウントを削除すると、ご自身が投稿したタイムライン投稿・コメント・メッセージ・写真・動画、プロフィール情報が
        <strong style={{ color: "var(--danger)" }}>完全に削除されます（元に戻せません）</strong>。
        チームの試合結果・チーム成績など、他のメンバーと共有される情報は削除後も残る場合があります。
      </p>

      {(session?.user as any)?.isOwner && (session?.user as any)?.teamId ? (
        <p style={{ fontSize: "13px", background: "rgba(0,0,0,0.03)", padding: "12px 16px", borderRadius: "var(--radius-sm)" }}>
          チームのオーナーは直接削除できません。先に
          <Link href="/dashboard/settings" style={{ color: "var(--primary)", fontWeight: 700 }}>チーム設定画面</Link>
          から「チームを解散する」か、他のメンバーにオーナー権限を移譲してから削除してください。
        </p>
      ) : !showDeleteAccount ? (
        <button
          type="button"
          className="btn"
          onClick={() => setShowDeleteAccount(true)}
          style={{ background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", padding: "8px 20px", fontSize: "13px" }}
        >
          アカウントを削除する...
        </button>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px" }}>
          <p style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>
            確認のため、ログインパスワードを入力してください:
          </p>
          <input
            type="password"
            className="form-control"
            placeholder="パスワード"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            disabled={deleteLoading}
            style={{ marginBottom: "12px" }}
          />
          {deleteError && (
            <p style={{ fontSize: "12px", color: "var(--danger)", fontWeight: 700, marginBottom: "12px" }}>{deleteError}</p>
          )}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setShowDeleteAccount(false); setDeletePassword(""); setDeleteError(""); }}
              disabled={deleteLoading}
              style={{ padding: "8px 16px", fontSize: "13px" }}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleDeleteAccount}
              disabled={deleteLoading || !deletePassword}
              style={{
                background: deletePassword ? "var(--danger)" : "rgba(255,71,87,0.3)",
                color: "#fff", border: "none", padding: "8px 20px", fontSize: "13px", fontWeight: 700,
                cursor: deletePassword ? "pointer" : "not-allowed",
              }}
            >
              {deleteLoading ? "削除処理中..." : "完全に削除する"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
