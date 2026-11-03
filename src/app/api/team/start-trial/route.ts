import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// FREE_ENTRY(無料の入団管理機能のみ)のチームが「SKILLBASEを試す」を選んだ時に呼ぶ。
// tierをFULLに切り替え、homebaseTrialStartedAtを今にセットする(登録月＋翌月無料トライアルの起点)。
// 一度FULLに切り替えたら、このAPIは再度呼んでもトライアル開始日を上書きしない(初回のみ)。
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, role: true },
    });
    if (!currentUser?.isOwner && currentUser?.role !== "MANAGER") {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }
    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    const team = await db.team.findUnique({
      where: { id: session.user.teamId },
      select: { tier: true, homebaseTrialStartedAt: true },
    });
    if (!team) {
      return NextResponse.json({ error: "チームが見つかりません。" }, { status: 404 });
    }
    if (team.tier === "FULL") {
      return NextResponse.json({ error: "すでにSKILLBASE本体をご利用中です。" }, { status: 400 });
    }

    const updated = await db.team.update({
      where: { id: session.user.teamId },
      data: {
        tier: "FULL",
        homebaseTrialStartedAt: team.homebaseTrialStartedAt || new Date(),
      },
      select: { tier: true, homebaseTrialStartedAt: true },
    });

    return NextResponse.json({ team: updated });
  } catch (error: any) {
    console.error("START_TRIAL_ERROR", error);
    return NextResponse.json({ error: "処理に失敗しました。" }, { status: 500 });
  }
}
