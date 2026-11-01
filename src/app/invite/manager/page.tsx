"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

interface TeamInfo {
  id: string;
  name: string;
  teamCode: string | null;
  category: string;
  ballType: string | null;
}

function RegisterManagerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") || "";

  const [inviteCode, setInviteCode] = useState(initialCode);
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [teamError, setTeamError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // 招待コードからチーム情報を検証・取得
  useEffect(() => {
    if (!inviteCode.trim()) {
      setTeam(null);
      setTeamError("");
      return;
    }

    let isMounted = true;
    const fetchTeam = async () => {
      setLoadingTeam(true);
      setTeamError("");
      try {
        const res = await fetch(`/api/auth/register-manager?code=${encodeURIComponent(inviteCode.trim().toUpperCase())}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "チームが見つかりません。");
        }
        if (isMounted) {
          setTeam(data.team);
        }
      } catch (err: any) {
        if (isMounted) {
          setTeam(null);
          setTeamError(err.message);
        }
      } finally {
        if (isMounted) setLoadingTeam(false);
      }
    };

    const timer = setTimeout(fetchTeam, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [inviteCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (password !== confirmPassword) {
      setSubmitError("パスワードが一致しません。");
      return;
    }

    if (password.length < 6) {
      setSubmitError("パスワードは6文字以上で設定してください。");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.trim().toUpperCase(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "登録に失敗しました。");
      }

      // 自動サインイン
      const loginRes = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        // 万が一自動ログインに失敗した場合はログイン画面へ
        alert("登録が完了しました！ログイン画面からログインしてください。");
        router.push("/login");
        return;
      }

      // ダッシュボードへ直接リダイレクト
      router.push("/dashboard");
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-center animate-fade-in" style={{ minHeight: "100vh", padding: "40px 16px" }}>
      <div className="card card-glass" style={{ width: "100%", maxWidth: "460px", padding: "32px 24px" }}>
        
        {/* ヘッダーエリア */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <span className="badge" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", marginBottom: "12px", display: "inline-block", padding: "4px 12px", borderRadius: "100px", fontWeight: 700, fontSize: "12px" }}>
            👔 指導者・スタッフ専用登録
          </span>
          <h1 style={{ fontSize: "clamp(20px, 5.5vw, 24px)", fontWeight: 800, margin: "8px 0" }}>
            {team ? team.name : "チーム指導者登録"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
            監督・コーチ・マネージャー・スコアラー等としてチームに参加します。
          </p>
        </div>

        {/* チーム確認バナー */}
        {team && (
          <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "var(--radius-md)", padding: "14px", marginBottom: "20px", textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>参加予定チーム</div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-main)" }}>⚾ {team.name}</div>
            {team.teamCode && (
              <div style={{ fontSize: "12px", color: "var(--primary)", marginTop: "4px", fontWeight: 600 }}>チームコード: {team.teamCode}</div>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {teamError && (
          <div style={{ background: "rgba(255, 71, 87, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "12px", borderRadius: "var(--radius-md)", fontSize: "13px", marginBottom: "16px", fontWeight: 600, textAlign: "center" }}>
            ⚠️ {teamError}
          </div>
        )}

        {submitError && (
          <div style={{ background: "rgba(255, 71, 87, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "12px", borderRadius: "var(--radius-md)", fontSize: "13px", marginBottom: "16px", fontWeight: 600 }}>
            {submitError}
          </div>
        )}

        {/* フォーム */}
        <form onSubmit={handleSubmit}>
          {/* 招待コード（URLに入っていない場合のみ入力欄を表示） */}
          {!initialCode && (
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label className="form-label" htmlFor="inviteCode">チーム招待コード</label>
              <input
                id="inviteCode"
                type="text"
                className="form-control"
                placeholder="例: TCB662"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                required
                disabled={submitting}
                style={{ letterSpacing: "2px", fontWeight: 700 }}
              />
              {loadingTeam && <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>チーム確認中...</p>}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label className="form-label" htmlFor="manager-name">お名前（指導者名）</label>
            <input
              id="manager-name"
              type="text"
              className="form-control"
              placeholder="例: 佐藤 健太"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label className="form-label" htmlFor="manager-email">メールアドレス（ログイン用）</label>
            <input
              id="manager-email"
              type="email"
              className="form-control"
              placeholder="coach@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label className="form-label" htmlFor="manager-password">パスワード</label>
            <input
              id="manager-password"
              type="password"
              className="form-control"
              placeholder="6文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={submitting}
            />
          </div>

          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label className="form-label" htmlFor="manager-confirm-password">パスワード（確認）</label>
            <input
              id="manager-confirm-password"
              type="password"
              className="form-control"
              placeholder="もう一度入力してください"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "12px", fontSize: "15px", fontWeight: 700 }}
            disabled={submitting || !team}
          >
            {submitting ? "登録中..." : "登録してチームに参加する"}
          </button>
        </form>

        {/* ログイン画面へのリンク */}
        <div style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "var(--text-muted)" }}>
          すでにアカウントをお持ちの方は{" "}
          <Link href="/login" style={{ color: "var(--primary)", fontWeight: 700 }}>
            こちらからログイン
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function RegisterManagerPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "40px" }}>読み込み中...</div>}>
      <RegisterManagerContent />
    </Suspense>
  );
}
