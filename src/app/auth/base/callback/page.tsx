"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

// 土台(HOMEBASE)から、通行証つきで戻ってくる所(試作・2026-11-11)。
// state が s- のとき: ログインする / l- のとき: ログイン中の SKILLBASE ユーザーを、BASE アカウントと結ぶ。
const MESSAGES: Record<string, string> = {
  BASE_NOT_LINKED:
    "この BASE アカウントは、まだ SKILLBASE のアカウントと結ばれていません。SKILLBASE に、今までのログインIDとパスワードでログインしてから、「BASE アカウントとつなぐ」を押してください。",
  BASE_LOGIN_FAILED: "ログインの確認ができませんでした（時間がたちすぎたか、別の端末で始めた可能性があります）。もう一度、はじめからためしてください。",
  "already-linked-other": "あなたの SKILLBASE アカウントは、すでに別の BASE アカウントと結ばれています。",
  "base-taken": "この BASE アカウントは、すでに別の SKILLBASE アカウントと結ばれています。",
  ticket: "つなぐ確認ができませんでした（時間がたちすぎたか、別の端末で始めた可能性があります）。もう一度、はじめからためしてください。",
  login: "SKILLBASE にログインしてから、もう一度ためしてください。",
};

function Inner() {
  const params = useSearchParams();
  const [message, setMessage] = useState("確認しています…");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const ticket = params.get("ticket") ?? "";
    // 通行証をアドレスの中に残さない
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      // state は、クッキー(httpOnly)から読めないので、通行証の中の値で照合する(サーバー側が、クッキーと見比べる)。
      const claimsState = readState(ticket);
      if (!ticket || !claimsState) {
        setMessage(MESSAGES.BASE_LOGIN_FAILED);
        return;
      }
      if (claimsState.startsWith("l-")) {
        const res = await fetch("/api/auth/base/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, state: claimsState }) });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && j.ok) {
          setMessage("BASE アカウントとつなぎました。");
          setDone(true);
          setTimeout(() => (window.location.href = "/dashboard/base-link"), 1200);
        } else {
          setMessage(MESSAGES[j.error ?? ""] ?? MESSAGES.ticket);
        }
        return;
      }
      const r = await signIn("base-ticket", { redirect: false, ticket, state: claimsState });
      if (r?.error) {
        setMessage(MESSAGES[r.error] ?? MESSAGES.BASE_LOGIN_FAILED);
        return;
      }
      window.location.href = "/dashboard";
    })();
  }, [params]);

  return (
    <div style={{ maxWidth: 440, margin: "80px auto", padding: 20, textAlign: "center" }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>BASE アカウント</h1>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: done ? "#047857" : "#334155" }}>{message}</p>
      {!done && message !== "確認しています…" && (
        <p style={{ marginTop: 16 }}>
          <a href="/login" style={{ color: "#1d4ed8", fontWeight: 700 }}>ログイン画面へ</a>
        </p>
      )}
    </div>
  );
}

/** 通行証の中の state を、読むだけ(署名の確認はサーバーがやる。ここは、l-/s- の振り分けに使うだけ) */
function readState(ticket: string): string {
  try {
    const body = ticket.split(".")[0];
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.state === "string" ? json.state : "";
  } catch {
    return "";
  }
}

export default function BaseCallbackPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
