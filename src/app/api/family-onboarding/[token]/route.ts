import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 家族向け配布ページの閲覧（ログイン不要・トークンのみで取得）。
// 各アカウントは現在の状態を都度DBから引き直す：
//  - 既に初回ログイン(パスワード変更)済みなら仮パスは表示しない（もう無効な情報なので）。
//  - アカウント自体が削除されていれば一覧から除く。
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const resolvedParams = await params;
    const onboarding = await db.familyOnboarding.findUnique({ where: { token: resolvedParams.token } });
    if (!onboarding) {
      return NextResponse.json({ error: "リンクが見つかりません。" }, { status: 404 });
    }
    if (new Date(onboarding.expiresAt) < new Date()) {
      return NextResponse.json({ error: "このリンクの有効期限が切れています。" }, { status: 410 });
    }

    const team = await db.team.findUnique({ where: { id: onboarding.teamId }, select: { name: true } });

    const saved: { userId: string; name: string; role: string; loginId: string; tempPassword: string }[] = JSON.parse(
      onboarding.accounts
    );
    const userIds = saved.map((a) => a.userId);
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, requiresPasswordChange: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    // 初回ログイン済みのアカウントの仮パスワードは、DBに残さず消去する（平文の保存期間を最小限にする）
    const activatedIds = new Set(users.filter((u) => u.requiresPasswordChange === false).map((u) => u.id));
    if (saved.some((a) => activatedIds.has(a.userId) && a.tempPassword)) {
      await db.familyOnboarding.update({
        where: { token: resolvedParams.token },
        data: { accounts: JSON.stringify(saved.map((a) => (activatedIds.has(a.userId) ? { ...a, tempPassword: "" } : a))) },
      });
    }

    const accounts = saved
      .filter((a) => byId.has(a.userId))
      .map((a) => {
        const u = byId.get(a.userId)!;
        const activated = u.requiresPasswordChange === false;
        return {
          name: u.name, // 本人が変更していれば最新の名前
          role: a.role,
          loginId: a.loginId,
          tempPassword: activated ? null : a.tempPassword,
          activated,
        };
      });

    return NextResponse.json({ teamName: team?.name || "", expiresAt: onboarding.expiresAt, accounts });
  } catch (e) {
    console.error("family-onboarding fetch error:", e);
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
}
