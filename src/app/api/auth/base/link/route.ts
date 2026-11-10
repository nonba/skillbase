import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { verifyTicket } from "@/lib/baseTicket";

// SKILLBASE にログイン中の人を、BASE アカウントと結ぶ(試作・2026-11-11)。自動では結ばない。
// 通す条件: ①SKILLBASE にログインしている ②通行証の署名・宛先・期限が正しい ③通行証の合言葉(state)が、この端末のクッキーと同じで、link 用(l-)
// ④その BASE アカウントが、ほかの SKILLBASE ユーザーに結ばれていない ⑤この人が、すでに別の BASE アカウントと結ばれていない。
// 解除は、この窓口ではやらない(別の確認が要るため)。

export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "login" }, { status: 401, headers });

  const body = await req.json().catch(() => null);
  const ticket = typeof body?.ticket === "string" ? body.ticket : "";
  const state = typeof body?.state === "string" ? body.state : "";
  const secret = getEnv("ID_TICKET_SECRET");
  const jar = await cookies();
  const cookieState = jar.get("base_state")?.value ?? "";
  const claims = secret.length >= 32 ? await verifyTicket(ticket, secret, "skillbase") : null;
  if (!claims || !state.startsWith("l-") || !cookieState || cookieState !== state || claims.state !== state) {
    return NextResponse.json({ error: "ticket" }, { status: 400, headers });
  }

  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, baseUserId: true } });
  if (!me) return NextResponse.json({ error: "login" }, { status: 401, headers });
  if (me.baseUserId && me.baseUserId !== claims.sub) return NextResponse.json({ error: "already-linked-other" }, { status: 409, headers });
  const other = await db.user.findUnique({ where: { baseUserId: claims.sub }, select: { id: true } });
  if (other && other.id !== me.id) return NextResponse.json({ error: "base-taken" }, { status: 409, headers });

  await db.user.update({ where: { id: me.id }, data: { baseUserId: claims.sub } });
  const res = NextResponse.json({ ok: true, baseName: claims.name }, { headers });
  res.cookies.set("base_state", "", { path: "/", maxAge: 0 });
  return res;
}
