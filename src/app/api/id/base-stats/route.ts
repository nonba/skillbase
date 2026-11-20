import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getIdTicketSecret } from "@/lib/env";
import { verifyTicket } from "@/lib/baseTicket";

// ローカル開発用（NODE_ENV !== "production"）の /api/id/base-stats シミュレータ窓口。
// SKILLBASE のサーバーが送った Bearer <stats-read 通行証> を検証し、BASE シリーズ準拠の閲覧範囲（self / children / team）で通算成績を返す。

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const headers = { "Cache-Control": "no-store" };
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  const secret = getIdTicketSecret();
  const claims = bearer && secret.length >= 32 ? await verifyTicket(bearer, secret, "stats-read") : null;
  if (!claims) return NextResponse.json({ error: "login" }, { status: 401, headers });

  const viewer =
    (await db.user.findUnique({
      where: { baseUserId: claims.sub },
      include: { children: { select: { id: true, name: true, jerseyNumber: true } } },
    })) ??
    (await db.user.findUnique({
      where: { id: claims.sub },
      include: { children: { select: { id: true, name: true, jerseyNumber: true } } },
    }));

  if (!viewer?.teamId) return NextResponse.json({ error: "no-team" }, { status: 403, headers });

  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "team") as "self" | "children" | "team";
  const canViewTeam = viewer.isOwner || viewer.role === "MANAGER" || viewer.canManageScore;
  if (scope === "team" && !canViewTeam) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  let targetPlayers: { id: string; name: string; jerseyNumber: string | null }[] = [];
  if (scope === "self") {
    targetPlayers = [{ id: viewer.id, name: viewer.name, jerseyNumber: viewer.jerseyNumber }];
  } else if (scope === "children") {
    if (viewer.children.length > 0) {
      targetPlayers = viewer.children;
    } else {
      const firstPlayer = await db.user.findFirst({
        where: { teamId: viewer.teamId, role: "PLAYER" },
        select: { id: true, name: true, jerseyNumber: true },
      });
      if (firstPlayer && viewer.role === "PARENT") targetPlayers = [firstPlayer];
    }
  } else {
    targetPlayers = await db.user.findMany({
      where: { teamId: viewer.teamId, role: "PLAYER" },
      select: { id: true, name: true, jerseyNumber: true },
      orderBy: { grade: "desc" },
    });
  }

  const players = targetPlayers.map((p) => ({
    userId: p.id,
    name: p.name,
    jerseyNumber: p.jerseyNumber ?? null,
  }));

  const batting = targetPlayers.map((p, idx) => ({
    user_id: p.id,
    games: 8,
    pa: 28,
    ab: 24,
    hits: Math.max(4, 11 - idx),
    doubles: 3,
    triples: idx === 0 ? 1 : 0,
    hr: idx === 0 ? 2 : 0,
    rbi: Math.max(2, 9 - idx),
    bb: 3,
    hbp: 1,
    so: 4,
    sh: 0,
    sf: 0,
    risp_ab: 8,
    risp_hits: Math.max(1, 4 - (idx % 3)),
  }));

  const running = targetPlayers.map((p, idx) => ({
    user_id: p.id,
    games: 8,
    sb: Math.max(1, 5 - idx),
    cs: 1,
    po: 0,
    oi: 0,
    adv_wp: 2,
    reaches: 14,
    hr: idx === 0 ? 2 : 0,
    runs: Math.max(2, 8 - idx),
    xbt_opp: 5,
    xbt_ok: 3,
    xbt_out: 0,
    tag_opp: 2,
    tag_ok: 2,
    tag_out: 0,
  }));

  const pitching = targetPlayers.slice(0, 2).map((p, idx) => ({
    user_id: p.id,
    games: 4,
    outs: idx === 0 ? 54 : 36,
    pitches: idx === 0 ? 245 : 168,
    batters: idx === 0 ? 68 : 48,
    hits: idx === 0 ? 11 : 9,
    hr: 1,
    bb: 4,
    hbp: 1,
    so: idx === 0 ? 22 : 14,
    runs: 4,
    earned: 3,
    wp: 1,
    balk: 0,
  }));

  return NextResponse.json({ scope, players, batting, running, pitching }, { headers });
}
