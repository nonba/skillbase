import { db } from "@/lib/db";

// 学年ベースの配信グループ（gradeFilter付き）のメンバーを、現在の選手の学年から再計算して同期する。
// グループ作成時・進級処理後・選手の学年変更後に呼ぶ。手動グループ(gradeFilter=null)は触らない。
export async function syncGradeGroups(teamId: string, onlyGroupId?: string) {
  const groups = await db.group.findMany({
    where: { teamId, gradeFilter: { not: null }, isArchived: false, ...(onlyGroupId ? { id: onlyGroupId } : {}) },
    select: { id: true, gradeFilter: true },
  });
  if (groups.length === 0) return;

  const players = await db.user.findMany({
    where: { teamId, role: "PLAYER", graduated: false, grade: { not: null } },
    select: { id: true, grade: true },
  });

  for (const g of groups) {
    const grades = (g.gradeFilter || "")
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));
    const memberIds = players
      .filter((p) => p.grade !== null && grades.includes(p.grade))
      .map((p) => ({ id: p.id }));
    // 「足すだけ」。手動で追加/削除した個別メンバーは維持し、対象学年の選手を取りこぼさないよう追加する。
    await db.group.update({
      where: { id: g.id },
      data: { members: { connect: memberIds } },
    });
  }
}
