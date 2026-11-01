import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateDues } from "@/lib/dues";
import { deriveSiblingRank } from "@/lib/playerAccount";
import { gradeLabel } from "@/lib/grade";

const ONE_TIME_KEY = "ONE_TIME";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return { error: NextResponse.json({ error: "ログインが必要です。" }, { status: 401 }) };
  }
  const currentUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isOwner: true, role: true, canManageUsers: true },
  });
  if (!currentUser?.isOwner && currentUser?.role !== "MANAGER" && !currentUser?.canManageUsers) {
    return { error: NextResponse.json({ error: "権限がありません。" }, { status: 403 }) };
  }
  if (!session.user.teamId) {
    return { error: NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 }) };
  }
  return { session };
}

function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

// 団費入金確認一覧(手動チェック)。指定した月の「その月の月謝＋その月が集金月のANNUAL項目」と、
// 選手ごとに1回だけの「入団時」一時金、それぞれの入金チェック状況を返す。
// 自動突合(銀行データ連携)を将来乗せる前提の土台のため、期待額はここで都度calculateDues()から
// 計算し直す(DuesPayment側には保存しない=料金設定が後から変わっても過去の期待額表示に影響しない)。
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const teamId = auth.session!.user.teamId!;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || new Date().toISOString().slice(0, 7);
  if (!isValidPeriod(period)) {
    return NextResponse.json({ error: "periodは YYYY-MM 形式で指定してください。" }, { status: 400 });
  }
  const monthNum = Number(period.slice(5, 7));

  try {
    const [team, players, feeItems, payments] = await Promise.all([
      db.team.findUnique({ where: { id: teamId }, select: { category: true, duesClosingMonth: true } }),
      db.user.findMany({
        where: { teamId, role: "PLAYER", graduated: false },
        select: { id: true, name: true, grade: true, birthDate: true },
        orderBy: [{ grade: "desc" }, { name: "asc" }],
      }),
      db.duesFeeItem.findMany({ where: { teamId, active: true } }),
      db.duesPayment.findMany({
        where: { teamId, periodKey: { in: [period, ONE_TIME_KEY] } },
      }),
    ]);

    const paymentMap = new Map<string, (typeof payments)[number]>();
    payments.forEach((p) => paymentMap.set(`${p.userId}:${p.periodKey}`, p));

    const rows: Array<{
      userId: string;
      name: string;
      grade: number | null;
      gradeLabel: string;
      siblingRank: number;
      recurring: { periodKey: string; expectedAmount: number; annualIncluded: boolean; paidAt: Date | null; paidAmount: number | null; note: string | null };
      oneTime: { periodKey: string; expectedAmount: number; applicable: boolean; paidAt: Date | null; paidAmount: number | null; note: string | null };
    }> = [];
    for (const player of players) {
      const { rank } = await deriveSiblingRank(player.id, teamId);
      const dues = calculateDues(feeItems, player.grade, rank, team?.duesClosingMonth ?? 3);
      const annualDueThisMonth = dues.annual
        .filter((a) => a.annualMonth === monthNum)
        .reduce((sum, a) => sum + a.amount, 0);
      const expectedRecurring = dues.monthlyTotal + annualDueThisMonth;

      const recurringPayment = paymentMap.get(`${player.id}:${period}`);
      const oneTimePayment = paymentMap.get(`${player.id}:${ONE_TIME_KEY}`);

      rows.push({
        userId: player.id,
        name: player.name,
        grade: player.grade,
        gradeLabel: gradeLabel(team?.category, player.grade),
        siblingRank: rank,
        recurring: {
          periodKey: period,
          expectedAmount: expectedRecurring,
          annualIncluded: annualDueThisMonth > 0,
          paidAt: recurringPayment?.paidAt ?? null,
          paidAmount: recurringPayment?.paidAmount ?? null,
          note: recurringPayment?.note ?? null,
        },
        oneTime: {
          periodKey: ONE_TIME_KEY,
          expectedAmount: dues.oneTimeTotal,
          applicable: dues.oneTimeTotal > 0,
          paidAt: oneTimePayment?.paidAt ?? null,
          paidAmount: oneTimePayment?.paidAmount ?? null,
          note: oneTimePayment?.note ?? null,
        },
      });
    }

    return NextResponse.json({ period, rows });
  } catch (error: any) {
    console.error("DUES_PAYMENTS_FETCH_ERROR", error);
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
}

// 入金チェックのON/OFF・金額/メモの手動更新。(userId, periodKey)ごとに1行をfindFirstしてから
// 作成/更新する(DBレベルのUNIQUE制約は使わない方針、[[baseball-saas-d1-incident-2026-09-01]]参照)。
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const teamId = auth.session!.user.teamId!;

  try {
    const body = await req.json();
    const userId = String(body.userId || "");
    const periodKey = String(body.periodKey || "");
    const paid = Boolean(body.paid);
    const paidAmount = body.paidAmount !== undefined && body.paidAmount !== null && body.paidAmount !== "" ? Number(body.paidAmount) : null;
    const note = body.note ? String(body.note).slice(0, 500) : null;

    if (!userId || !periodKey) {
      return NextResponse.json({ error: "userId・periodKeyは必須です。" }, { status: 400 });
    }
    if (periodKey !== ONE_TIME_KEY && !isValidPeriod(periodKey)) {
      return NextResponse.json({ error: "periodKeyの形式が不正です。" }, { status: 400 });
    }

    // 対象選手がこのチームに所属しているか確認(他チームのuserIdを渡されても操作できないように)
    const player = await db.user.findFirst({ where: { id: userId, teamId, role: "PLAYER" }, select: { id: true } });
    if (!player) {
      return NextResponse.json({ error: "選手が見つかりません。" }, { status: 404 });
    }

    const existing = await db.duesPayment.findFirst({ where: { teamId, userId, periodKey } });

    if (existing) {
      const updated = await db.duesPayment.update({
        where: { id: existing.id },
        data: {
          paidAt: paid ? existing.paidAt ?? new Date() : null,
          paidAmount,
          note,
          markedBy: "MANUAL",
        },
      });
      return NextResponse.json({ payment: updated });
    }

    const created = await db.duesPayment.create({
      data: {
        teamId,
        userId,
        periodKey,
        paidAt: paid ? new Date() : null,
        paidAmount,
        note,
        markedBy: "MANUAL",
      },
    });
    return NextResponse.json({ payment: created });
  } catch (error: any) {
    console.error("DUES_PAYMENTS_UPDATE_ERROR", error);
    return NextResponse.json({ error: "更新に失敗しました。" }, { status: 500 });
  }
}
