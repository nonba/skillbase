import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getIdTicketSecret } from "@/lib/env";
import { signTicket } from "@/lib/baseTicket";

// ローカル開発用（NODE_ENV !== "production"）の BASE ID SSO シミュレータ窓口。
// 本番では BASE_ID_URL が外部窓口（homebase.easystance.app / id.easystance.app）を指すためここは呼ばれない。
// 手元確認で「🔑 BASE アカウントでログイン」を押したとき、本物の署名つき通行証（signTicket）を発行して /auth/base/callback へ戻す。

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const aud = url.searchParams.get("aud") ?? "skillbase";
  const ret = url.searchParams.get("return") ?? `${url.origin}/auth/base/callback`;
  const state = url.searchParams.get("state") ?? "";
  const pickEmail = url.searchParams.get("email") ?? "";

  if (!pickEmail) {
    const picker = new URL("/auth/base/dev-sso", url.origin);
    picker.searchParams.set("aud", aud);
    picker.searchParams.set("return", ret);
    picker.searchParams.set("state", state);
    return NextResponse.redirect(picker, 302);
  }

  let user = await db.user.findUnique({ where: { email: pickEmail } });
  if (!user) {
    user = await db.user.findFirst();
  }
  if (!user) {
    return NextResponse.json({ error: "no-seed-user" }, { status: 404 });
  }

  const baseId = user.baseUserId || user.id;
  if (!user.baseUserId) {
    await db.user.update({ where: { id: user.id }, data: { baseUserId: baseId } });
  }

  const secret = getIdTicketSecret();
  const ticket = await signTicket(
    { sub: baseId, name: user.name, teamId: user.teamId ?? null, aud, state },
    secret
  );

  const target = new URL(ret);
  target.searchParams.set("ticket", ticket);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
