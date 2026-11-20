import { NextResponse } from "next/server";
import { getIdTicketSecret } from "@/lib/env";
import { verifyTicket } from "@/lib/baseTicket";

// ローカル開発用（NODE_ENV !== "production"）の /api/id/base-games シミュレータ窓口。
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const headers = { "Cache-Control": "no-store" };
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  const secret = getIdTicketSecret();
  const claims = bearer && secret.length >= 32 ? await verifyTicket(bearer, secret, "stats-read") : null;
  if (!claims) return NextResponse.json({ error: "login" }, { status: 401, headers });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");

  const allGames = [
    {
      rec_game_id: "rec-2026-1115",
      game_date: "2026-11-15",
      opponent_name: "青葉ボーイズ",
      tournament: "秋季県大会",
      kind: "OFFICIAL",
      round: "準決勝",
      venue: "市民球場",
      my_runs: 6,
      opp_runs: 2,
      status: "FINISHED",
    },
    {
      rec_game_id: "rec-2026-1108",
      game_date: "2026-11-08",
      opponent_name: "港南シニア",
      tournament: "練習試合",
      kind: "PRACTICE",
      round: null,
      venue: "第2グラウンド",
      my_runs: 4,
      opp_runs: 3,
      status: "FINISHED",
    },
    {
      rec_game_id: "rec-2026-1101",
      game_date: "2026-11-01",
      opponent_name: "東都ヤング",
      tournament: "秋季県大会",
      kind: "OFFICIAL",
      round: "2回戦",
      venue: "県営球場",
      my_runs: 8,
      opp_runs: 1,
      status: "FINISHED",
    },
  ];

  const games = kind ? allGames.filter((g) => g.kind === kind) : allGames;
  return NextResponse.json({ games }, { headers });
}
