import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 未使用の仮保護者アカウントを掃除する（B安全版）。
// 条件: ある選手に「有効化済み（初ログイン済み）の家族」が2名そろったら、
//       同じ選手に紐付いた未ログインの仮アカ（保護者）を削除する。
// ※削除対象は「一度もログインしていない仮アカ」だけ。有効化済み（実在の人）は絶対に消さない。
// ※まだ2名そろっていない選手の仮アカは、招待を開けたまま残す（削除しない）。
// Cloudflare Workers に常駐cronを置きにくいため、名簿を開いたタイミングで呼ばれる。
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canManageUsers =
      (session.user as any).isOwner ||
      (session.user as any).canManageUsers ||
      session.user.role === "MANAGER";
    if (!canManageUsers || !session.user.teamId) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }

    const members = await db.user.findMany({
      where: { teamId: session.user.teamId },
      select: {
        id: true,
        role: true,
        requiresPasswordChange: true,
        createdAt: true,
        children: { select: { id: true } },
      },
    });

    // 各選手ごとに「その選手を子に持つ家族（保護者・指導者）」を集計
    const players = members.filter((m) => m.role === "PLAYER");
    const idsToDelete = new Set<string>();

    for (const player of players) {
      const family = members.filter((m) => m.children.some((c) => c.id === player.id));
      const activatedCount = family.filter((m) => m.requiresPasswordChange === false).length;
      if (activatedCount < 2) continue; // 有効化済みの家族が2名そろっていなければ、招待は開けたまま残す

      // 2名そろったので、同じ選手に紐付いた「未ログインの仮保護者アカ」を即削除（有効化済みは消さない）
      family.forEach((m) => {
        if (m.role === "PARENT" && m.requiresPasswordChange === true) {
          idsToDelete.add(m.id);
        }
      });
    }

    let deleted = 0;
    for (const id of idsToDelete) {
      try {
        await db.user.delete({ where: { id } });
        deleted++;
      } catch (e) {
        console.error("cleanup-provisional-parents: failed to delete", id, e);
      }
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    console.error("CLEANUP_PROVISIONAL_PARENTS_ERROR", error);
    return NextResponse.json({ error: "掃除処理に失敗しました。", details: String(error?.message || error) }, { status: 500 });
  }
}
