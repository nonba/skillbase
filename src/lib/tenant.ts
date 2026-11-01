import { db } from "./db";

// テナント(チーム)境界の共通チェック。
// 他チームのIDを指定された場合は「存在しない」と同じ扱いにして、存在の有無も漏らさない。

export async function isEventInTeam(eventId: string, teamId: string | null | undefined): Promise<boolean> {
  if (!eventId || !teamId) return false;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { teamId: true } });
  return !!event && event.teamId === teamId;
}

// 指定ユーザーIDのうち、同じチームに所属するものだけを返す。
export async function filterUserIdsInTeam(userIds: unknown, teamId: string | null | undefined): Promise<string[]> {
  if (!teamId || !Array.isArray(userIds)) return [];
  const ids = userIds.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0) return [];
  const rows = await db.user.findMany({ where: { id: { in: ids }, teamId }, select: { id: true } });
  return rows.map((r) => r.id);
}

// 指定グループIDのうち、同じチームのグループだけを返す。配列でなければ undefined（=変更なし）を返す。
export async function filterGroupIdsInTeam(groupIds: unknown, teamId: string | null | undefined): Promise<string[] | undefined> {
  if (!Array.isArray(groupIds)) return undefined;
  const ids = groupIds.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0 || !teamId) return [];
  const rows = await db.group.findMany({ where: { id: { in: ids }, teamId }, select: { id: true } });
  return rows.map((r) => r.id);
}
