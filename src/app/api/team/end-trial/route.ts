import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isWithinSignupFreeTrial } from "@/lib/billing";

// FULLに切り替えた(HOMEBASEを試す)チームが、やっぱりFREE_ENTRY(無料の入団管理機能のみ)に
// 戻るためのAPI(2026-09-02追加、start-trialの逆方向)。
// 2026-09-03: 「運営に問い合わせて」で止めるのではなく完全セルフサービス化。ただし無料トライアルを
// 過ぎている場合は「直近1ヶ月分は請求が通る(日割り返金なし)」というオーナー方針のルールに従い、
// tierは即座にFREE_ENTRYへ切り替えてHOMEBASE機能をロックしつつ、会費Payのコース自体の解約は
// downgradeRequestedAtを立てて billing-check cron に委ね、今月の請求締切(12日)を過ぎてから行う。
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
      select: { tier: true, homebaseTrialStartedAt: true, kaihipayCustomerNumber: true },
    });
    if (!team) {
      return NextResponse.json({ error: "チームが見つかりません。" }, { status: 404 });
    }
    if (team.tier === "FREE_ENTRY") {
      return NextResponse.json({ error: "すでに無料プランです。" }, { status: 400 });
    }

    const withinTrial = team.homebaseTrialStartedAt ? isWithinSignupFreeTrial(new Date(team.homebaseTrialStartedAt)) : true;
    // トライアル終了後の解約は、会費Pay側のコース解約を今月の請求締切後まで遅らせる
    // (=直近1ヶ月分は請求が通る)。billing-checkのcronが実際の解約を行う。
    const needsDelayedCancel = !withinTrial && !!team.kaihipayCustomerNumber;

    const updated = await db.team.update({
      where: { id: session.user.teamId },
      data: {
        tier: "FREE_ENTRY",
        homebaseTrialStartedAt: null,
        // 再度「HOMEBASEを試す」を押した時にトライアル督促/ロックの古い状態を引きずらないようリセット。
        trialPaymentReminderSentAt: null,
        trialLockedAt: null,
        downgradeRequestedAt: needsDelayedCancel ? new Date() : null,
      },
      select: { tier: true },
    });

    return NextResponse.json({
      team: updated,
      message: needsDelayedCancel
        ? "無料プランに切り替えました。なお、直近1ヶ月分のお支払いは既にご案内の通り発生します（日割り返金はありません）。翌月以降は請求が発生しません。"
        : undefined,
    });
  } catch (error: any) {
    console.error("END_TRIAL_ERROR", error);
    return NextResponse.json({ error: "処理に失敗しました。" }, { status: 500 });
  }
}
