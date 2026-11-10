import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { signTicket } from "@/lib/baseTicket";

// 土台(HOMEBASE)にある、個人成績(SCOREBASE から送られた、試合ごと・選手ごとの成績)を、読んで返す(試作・2026-11-11)。
// SKILLBASE にログイン中で、BASE アカウントと結ばれている人だけ。見る人は「自分」(土台の窓口が、本人の分だけを返す)。
// サーバー同士: BASE アカウントの id(baseUserId)で、短い期限(3分)の通行証(宛先 stats-read)を作り、土台の窓口を呼ぶ。ブラウザには、通行証を渡さない。
// 成績は、土台が正。SKILLBASE は、読んで出すだけ(保存しない)。
// ※ 保護者→子ども、指導者→チーム全員は、まだ(土台に親子の関係の窓口がない)。

function randomState(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return "srv-" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "login" }, { status: 401, headers });

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { name: true, baseUserId: true, role: true } });
  if (!user?.baseUserId) return NextResponse.json({ linked: false }, { headers });

  const secret = getEnv("ID_TICKET_SECRET");
  const idBase = getEnv("BASE_ID_URL").replace(/\/$/, "");
  if (secret.length < 32 || !/^https?:\/\//.test(idBase)) return NextResponse.json({ linked: true, error: "unavailable" }, { status: 503, headers });

  try {
    const ticket = await signTicket({ sub: user.baseUserId, name: user.name, teamId: null, aud: "stats-read", state: randomState() }, secret);
    // 見る範囲を、役割で決める(最終的な判定は、土台がやる。権限がなければ 403 → 自分の分に戻す)
    // 指導者(MANAGER)=チームの選手みんな / 保護者(PARENT)=ひもづけた子ども / 選手=自分
    const query = user.role === "MANAGER" ? "?all=1" : user.role === "PARENT" ? "?scope=children" : "";
    const call = (q: string) => fetch(`${idBase}/api/id/player-stats${q}`, { headers: { Authorization: `Bearer ${ticket}` }, cache: "no-store" });
    let res = await call(query);
    if (res.status === 403 && query) res = await call("");
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return NextResponse.json({ linked: true, error: j.error ?? "unavailable" }, { status: res.status === 403 ? 200 : 502, headers });
    }
    const j = (await res.json()) as { players?: unknown[] };
    return NextResponse.json({ linked: true, players: j.players ?? [] }, { headers });
  } catch {
    return NextResponse.json({ linked: true, error: "unavailable" }, { status: 502, headers });
  }
}
