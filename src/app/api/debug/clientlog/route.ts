import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 一時デバッグ用: クライアント(スマホのWebView)の通話ログをサーバーに集約し、
// `wrangler tail` から追えるようにする。原因特定が済んだら削除する。
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const who = session?.user?.name || session?.user?.id || "anon";
    const body = await req.json().catch(() => ({}));
    const tag = String(body?.tag || "").slice(0, 40);
    const msg = String(body?.msg ?? "").slice(0, 500);
    console.log(`[CLIENT-CALL] (${who}) ${tag}: ${msg}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
