"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EMAIL_NOT_VERIFIED_ERROR } from "@/lib/authMessages";
import { isNativeApp } from "@/lib/platform";

function ResendVerificationBox({ email }: { email: string }) {
  const [newEmail, setNewEmail] = useState(email);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [resendError, setResendError] = useState("");

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError("");
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
        setResendError(data.error || "再送に失敗しました。");
        return;
      }
      setMessage(`${data.email} に確認メールを再送しました。`);
      setEditing(false);
    } catch {
      setResendError("通信エラーが発生しました。");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: "-8px", marginBottom: "20px" }}>
      {message && (
        <div style={{ fontSize: "13px", color: "var(--success)", marginBottom: "8px" }}>{message}</div>
      )}
      {resendError && (
        <div style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "8px" }}>{resendError}</div>
      )}
      {!editing ? (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button type="button" onClick={handleResend} disabled={sending} className="btn btn-secondary" style={{ fontSize: "13px", padding: "6px 12px", height: "auto" }}>
            {sending ? "送信中..." : "確認メールを再送する"}
          </button>
          <button type="button" onClick={() => setEditing(true)} style={{ fontSize: "13px", color: "var(--text-muted)", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}>
            アドレスを間違えた方はこちら
          </button>
        </div>
      ) : (
        <form onSubmit={handleResend} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="email"
            className="form-control"
            style={{ maxWidth: "240px" }}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={sending} className="btn btn-secondary" style={{ fontSize: "13px", padding: "6px 12px", height: "auto" }}>
            {sending ? "送信中..." : "このアドレスに送り直す"}
          </button>
        </form>
      )}
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setSuccess("ユーザー登録が完了しました！ログインしてください。");
    }
    if (searchParams.get("verified") === "1") {
      setSuccess("メールアドレスを確認しました。ログインしてください。");
    }
    if (searchParams.get("verify_error") === "1") {
      setError("確認リンクが無効です。お手数ですが再送をお試しください。");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    let deviceId = localStorage.getItem("homebase_device_id");
    if (!deviceId) {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        deviceId = crypto.randomUUID();
      } else {
        deviceId = "dev_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      localStorage.setItem("homebase_device_id", deviceId);
    }

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        deviceId,
        userAgent: navigator.userAgent,
      });

      if (res?.error) {
        throw new Error(res.error || "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。");
      }

      const inviteCode = searchParams.get("inviteCode");
      if (inviteCode) {
        window.location.href = `/dashboard?inviteCode=${inviteCode}`;
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="card card-glass" style={{ width: "100%", maxWidth: "450px", padding: "28px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <span className="badge badge-accent" style={{ marginBottom: "12px" }}>Welcome Back</span>
        <h1 style={{ fontSize: "clamp(20px, 6.5vw, 26px)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
          ⚡ SKILLBASE <span style={{ color: "var(--primary)" }}>ログイン</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "8px" }}>
          野球指導・知識共有プラットフォームへアクセス
        </p>
      </div>

      {success && (
        <div style={{
          background: "rgba(46, 213, 115, 0.15)",
          border: "1px solid var(--success)",
          color: "var(--success)",
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          fontSize: "14px",
          marginBottom: "20px",
          fontWeight: 600
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          background: "rgba(255, 71, 87, 0.1)",
          border: "1px solid var(--danger)",
          color: "var(--danger)",
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          fontSize: "14px",
          marginBottom: "12px",
          fontWeight: 600
        }}>
          {error}
        </div>
      )}

      {error === EMAIL_NOT_VERIFIED_ERROR && <ResendVerificationBox email={email} />}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="login-email">ログインID</label>
          <input
            id="login-email"
            type="text"
            className="form-control"
            placeholder="ログインIDを入力"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            type="password"
            className="form-control"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <button
          id="login-submit-btn"
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "12px", height: "48px" }}
          disabled={loading}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      <a
        href="/api/auth/base/start?mode=login"
        className="btn btn-secondary"
        style={{ width: "100%", display: "block", textAlign: "center", textDecoration: "none", marginTop: "10px", height: "44px", lineHeight: "44px", fontWeight: 700 }}
      >
        🔑 BASE アカウントでログイン
      </a>

      {!isNativeApp() && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>または</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>初めての方（新しくチームを作る）</p>
            <Link href="/register" className="btn btn-secondary" style={{ width: "100%", display: "block", textDecoration: "none" }}>
              新しくチームを作成する
            </Link>
          </div>
        </>
      )}

      <div style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "var(--text-muted)" }}>
        ※既にチームに所属していて、パスワードを忘れた場合は<br />チームの管理者にお問い合わせください。
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 20px" }}>
      <Suspense fallback={<div>読み込み中...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
