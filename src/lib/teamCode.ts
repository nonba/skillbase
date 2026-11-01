import { db } from "@/lib/db";

// team/createと同じ採番ルール(ST001, ST002...)で、teamCodeが未設定のチームに後付けで発番する。
// 2026-09-01のD1移行事故などで既存チームのteamCodeが失われるケースがあり、新規メンバー作成・
// 入団申込み承認等がまとめてエラーになっていた。ここを共通の入口にして自己修復させる。
export async function ensureTeamCode(teamId: string): Promise<string> {
  const team = await db.team.findUnique({ where: { id: teamId }, select: { teamCode: true } });
  if (team?.teamCode) return team.teamCode;

  const lastTeam = await db.team.findFirst({
    where: { teamCode: { startsWith: "ST" } },
    orderBy: { teamCode: "desc" },
    select: { teamCode: true },
  });

  let nextIndex = 1;
  if (lastTeam?.teamCode) {
    const match = lastTeam.teamCode.match(/^ST(\d+)$/);
    if (match) nextIndex = parseInt(match[1], 10) + 1;
  }

  let teamCode = "";
  let isUnique = false;
  while (!isUnique) {
    teamCode = `ST${String(nextIndex).padStart(3, "0")}`;
    const existing = await db.team.findUnique({ where: { teamCode } });
    if (!existing) {
      isUnique = true;
    } else {
      nextIndex++;
    }
  }

  await db.team.update({ where: { id: teamId }, data: { teamCode } });
  return teamCode;
}
