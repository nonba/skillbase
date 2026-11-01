import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStandardStorageBytes } from "@/lib/billing";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, role: true }
    });

    if (!currentUser?.isOwner && currentUser?.role !== "MANAGER") {
      return NextResponse.json({ error: "チームの設定を変更する権限がありません。" }, { status: 403 });
    }

    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    const { name, description, maxUsers, scorePlan, statsVisibility, statsVisibleGroupIds, maxStorageBytes, category, ballType, homeGround, snsLinks, isProfilePublic } = await req.json();

    // 課金に直結する項目は、画面で選べる正規の組み合わせだけを受け付ける（任意の値で課金を逃れられないように）
    const GB = 1073741824;
    const ALLOWED_PLANS = [30, 60, 90, 120];
    const ALLOWED_SCORE_PLANS = ["NONE", "SIMPLE", "FULL"];
    if (maxUsers !== undefined && !ALLOWED_PLANS.includes(Number(maxUsers))) {
      return NextResponse.json({ error: "不正なプランです。" }, { status: 400 });
    }
    if (scorePlan !== undefined && !ALLOWED_SCORE_PLANS.includes(scorePlan)) {
      return NextResponse.json({ error: "不正なスコアプランです。" }, { status: 400 });
    }
    if (maxStorageBytes !== undefined) {
      // 標準容量 + 追加パック(+10/+30/+50GBを最大3つ)で作れる値のみ許可
      const effectiveUsers = maxUsers !== undefined ? Number(maxUsers) : (await db.team.findUnique({ where: { id: session.user.teamId }, select: { maxUsers: true } }))?.maxUsers ?? 30;
      const addedGB = Math.round((Number(maxStorageBytes) - getStandardStorageBytes(effectiveUsers)) / GB);
      const reachable = new Set<number>();
      const packs = [10, 30, 50];
      for (const a of [0, ...packs]) for (const b of [0, ...packs]) for (const c of [0, ...packs]) reachable.add(a + b + c);
      if (!Number.isFinite(addedGB) || !reachable.has(addedGB)) {
        return NextResponse.json({ error: "不正な容量設定です。" }, { status: 400 });
      }
    }

    const validCategory = ["ELEMENTARY", "JUNIOR_HIGH", "HIGH_SCHOOL"].includes(category) ? category : undefined;
    const validBallType = ["SOFT", "HARD"].includes(ballType) ? ballType : (ballType === null ? null : undefined);

    const updatedTeam = await db.team.update({
      where: { id: session.user.teamId },
      data: {
        name: name !== undefined ? name : undefined,
        description: description !== undefined ? description : undefined,
        category: validCategory,
        maxUsers: maxUsers !== undefined ? Number(maxUsers) : undefined,
        scorePlan: scorePlan !== undefined ? scorePlan : undefined,
        maxStorageBytes: maxStorageBytes !== undefined ? Number(maxStorageBytes) : undefined,
        statsVisibility: statsVisibility !== undefined ? statsVisibility : undefined,
        statsVisibleGroups: statsVisibleGroupIds !== undefined ? {
          set: statsVisibleGroupIds.map((id: string) => ({ id }))
        } : undefined,
        ballType: validBallType,
        homeGround: homeGround !== undefined ? homeGround : undefined,
        snsLinks: snsLinks !== undefined ? JSON.stringify(snsLinks) : undefined,
        isProfilePublic: isProfilePublic !== undefined ? Boolean(isProfilePublic) : undefined,
      },
    });

    return NextResponse.json({
      message: "チーム設定を更新しました。",
      team: updatedTeam,
    });
  } catch (error: any) {
    console.error("Team settings update error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
