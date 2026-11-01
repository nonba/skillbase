"use client";

import React, { useState } from "react";
import { signOut } from "next-auth/react";

interface Props {
  isOpen: boolean;
}

export function ForcePasswordChangeModal({ isOpen }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("パスワードは6文字以上で設定してください。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("確認用パスワードが一致しません。");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword }),
      });

      if (res.ok) {
        // パスワード変更後、セッションを更新するために一度ログアウトさせるか、リロードする。
        // NextAuthのセッション内のフラグを更新するにはページリロードかupdate()が必要。
        // セキュリティのため、変更後は一度強制ログアウトさせて再ログインさせるのが安全。
        alert("パスワードを変更しました。新しいパスワードでもう一度ログインしてください。");
        await signOut({ callbackUrl: "/login" });
      } else {
        const data = await res.json();
        setError(data.error || "パスワードの変更に失敗しました。");
      }
    } catch (err) {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(15, 23, 42, 0.8)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      padding: "20px"
    }}>
      <div className="card" style={{ width: "100%", maxWidth: "400px", animation: "fadeIn 0.3s ease" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px", textAlign: "center" }}>
          パスワードの変更が必要です
        </h2>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px", textAlign: "center", lineHeight: "1.5" }}>
          安全のため、管理者が設定した仮パスワードからあなた専用のパスワードに変更してください。
        </p>
        
        {error && (
          <div style={{
            background: "rgba(255, 71, 87, 0.1)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "12px",
            borderRadius: "var(--radius-md)",
            marginBottom: "16px",
            fontSize: "14px",
            fontWeight: 600,
            textAlign: "center"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="new-password">新しいパスワード</label>
            <input
              id="new-password"
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="confirm-password">新しいパスワード (確認用)</label>
            <input
              id="confirm-password"
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "8px" }}
          >
            {loading ? "変更中..." : "パスワードを変更する"}
          </button>
        </form>
      </div>
    </div>
  );
}
