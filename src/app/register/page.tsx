"use client";

import { useState } from "react";
import Link from "next/link";
import { isNativeApp } from "@/lib/platform";

function PendingVerificationCard({ email }: { email: string }) {
  const [newEmail, setNewEmail] = useState(email);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, new_email: editing ? newEmail.trim() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "再送に失敗しました。");
        return;
      }
      setMessage(`${data.email} に確認メールを再送しました。`);
      setEditing(false);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card card-glass" style={{ width: "100%", maxWidth: "450px", padding: "28px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <span className="badge badge-accent" style={{ marginBottom: "12px" }}>確認メール送信済み</span>
        <h1 style={{ fontSize: "clamp(18px, 5.5vw, 22px)", fontWeight: 800 }}>メールをご確認ください</h1>
      </div>

      <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.8, textAlign: "center", marginBottom: "20px" }}>
        <strong>{email}</strong> 宛てに確認メールを送信しました。<br />
        メール内のリンクをクリックすると、ログインできるようになります。
      </p>

      {message && (
        <div style={{ fontSize: "13px", color: "var(--success)", textAlign: "center", marginBottom: "12px" }}>{message}</div>
      )}
      {error && (
        <div style={{ fontSize: "13px", color: "var(--danger)", textAlign: "center", marginBottom: "12px" }}>{error}</div>
      )}

      {!editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
          <button type="button" onClick={handleResend} disabled={sending} className="btn btn-secondary" style={{ width: "100%" }}>
            {sending ? "送信中..." : "メールを再送する"}
          </button>
          <button type="button" onClick={() => setEditing(true)} style={{ fontSize: "13px", color: "var(--text-muted)", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}>
            アドレスを間違えた方はこちら
          </button>
        </div>
      ) : (
        <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <input
            type="email"
            className="form-control"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={sending} className="btn btn-primary" style={{ width: "100%" }}>
            {sending ? "送信中..." : "このアドレスに送り直す"}
          </button>
        </form>
      )}

      <div style={{ textAlign: "center", marginTop: "20px", fontSize: "14px", color: "var(--text-muted)" }}>
        <Link href="/login" style={{ color: "var(--primary)", fontWeight: 700 }}>ログイン画面に戻る</Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("パスワードが一致しません。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "登録に失敗しました。");
      }

      setPendingEmail(data.email || email);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) {
    return (
      <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 20px" }}>
        <PendingVerificationCard email={pendingEmail} />
      </main>
    );
  }

  if (isNativeApp()) {
    return (
      <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 20px" }}>
        <div className="card card-glass" style={{ width: "100%", maxWidth: "450px", padding: "28px 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "12px" }}>新規チーム登録</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.8, marginBottom: "20px" }}>
            この機能はご利用いただけません。
          </p>
          <Link href="/login" style={{ color: "var(--primary)", fontWeight: 700, fontSize: "14px" }}>ログイン画面に戻る</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 20px" }}>
      <div className="card card-glass" style={{ width: "100%", maxWidth: "450px", padding: "28px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <span className="badge badge-accent" style={{ marginBottom: "12px" }}>New Team</span>
          <h1 style={{ fontSize: "clamp(20px, 6.5vw, 26px)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
            ⚡ SKILLBASE <span style={{ color: "var(--primary)" }}>新チーム登録</span>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "8px" }}>
            監督・代表者としてアカウントを作成します
          </p>
        </div>

        {error && (
          <div style={{
            background: "rgba(255, 71, 87, 0.1)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            fontSize: "14px",
            marginBottom: "20px",
            fontWeight: 600
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">お名前</label>
            <input
              id="register-name"
              type="text"
              className="form-control"
              placeholder="例: 山田太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">メールアドレス</label>
            <input
              id="register-email"
              type="email"
              className="form-control"
              placeholder="例: coach@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              選手・保護者の方はメール登録不要です（チーム作成後、管理者が名簿から追加します）。登録後、このアドレス宛てに確認メールを送ります。
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-password">パスワード</label>
            <input
              id="register-password"
              type="password"
              className="form-control"
              placeholder="6文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-confirm-password">パスワード（確認）</label>
            <input
              id="register-confirm-password"
              type="password"
              className="form-control"
              placeholder="もう一度入力"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "12px", height: "48px" }}
            disabled={loading}
          >
            {loading ? "登録中..." : "登録してはじめる"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "var(--text-muted)" }}>
          すでにアカウントをお持ちの方は <Link href="/login" style={{ color: "var(--primary)", fontWeight: 700 }}>ログイン</Link>
        </div>
      </div>
    </main>
  );
}
