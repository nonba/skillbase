import { NextResponse } from "next/server";
import { getBaseIdUrl } from "@/lib/env";

// 「BASE アカウントでログイン」の入口(試作・2026-11-11 / 2026-11-20更新)。ブラウザを、窓口(BASE_ID_URL)のログインへ移す。
// mode=login: ふつうのログイン / mode=link: ログイン中の SKILLBASE ユーザーを、BASE アカウントと結ぶ。
// 合言葉(state)を作って、この端末のクッキー(base_state・5分)に置き、窓口へ渡す。戻ってきた通行証の state と同じでなければ、使えない。
// 窓口のアドレスは、環境変数 BASE_ID_URL(例: https://homebase.easystance.app → https://id.easystance.app)。設定だけで差し替えられる。

function randomState(prefix: "s-" | "l-"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";
  const idBase = getBaseIdUrl();
  if (!/^https?:\/\//.test(idBase)) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const state = randomState(mode === "link" ? "l-" : "s-");
  const back = `${url.origin}/auth/base/callback`;
  const target = `${idBase}/api/id/sso?aud=skillbase&return=${encodeURIComponent(back)}&state=${encodeURIComponent(state)}`;
  const res = NextResponse.redirect(target, 302);
  res.cookies.set("base_state", state, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 300 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
