import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ログイン中の人が、BASE アカウントと結ばれているか(試作・2026-11-11)。結ばれているかだけを返す(BASE 側の id は返さない)。
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "login" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { baseUserId: true } });
  return NextResponse.json({ linked: Boolean(u?.baseUserId) }, { headers: { "Cache-Control": "no-store" } });
}
