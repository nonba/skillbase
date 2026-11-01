import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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

const VALID_TIMINGS = ["ONE_TIME", "MONTHLY", "ANNUAL"];

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const items = await db.duesFeeItem.findMany({
    where: { teamId: auth.session!.user.teamId! },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ items });
}

// 団費の締め月(年度最終月)・支払い方法/振込先の変更(2026-09-10追加)。明細一覧とは別に、
// チーム単位の設定としてここに置く(/attach/dues-settingsが唯一の利用箇所のため専用
// エンドポイントは作らずここに同居)。どちらか片方だけの送信も可。
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json();
  const data: { duesClosingMonth?: number; duesPaymentInfo?: string | null } = {};

  if (body.duesClosingMonth !== undefined) {
    const month = Number(body.duesClosingMonth);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "締め月は1〜12の数字で指定してください。" }, { status: 400 });
    }
    data.duesClosingMonth = month;
  }
  if (body.duesPaymentInfo !== undefined) {
    data.duesPaymentInfo = body.duesPaymentInfo ? String(body.duesPaymentInfo).slice(0, 2000) : null;
  }

  const team = await db.team.update({
    where: { id: auth.session!.user.teamId! },
    data,
    select: { duesClosingMonth: true, duesPaymentInfo: true },
  });
  return NextResponse.json({ team });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { name, timing, annualMonth, amountsByGrade, hasSiblingDiscount, siblingDiscountByRank } = await req.json();
    if (!name || !VALID_TIMINGS.includes(timing)) {
      return NextResponse.json({ error: "項目名とタイミングは必須です。" }, { status: 400 });
    }
    const count = await db.duesFeeItem.count({ where: { teamId: auth.session!.user.teamId! } });
    const item = await db.duesFeeItem.create({
      data: {
        teamId: auth.session!.user.teamId!,
        name,
        timing,
        annualMonth: timing === "ANNUAL" ? Number(annualMonth) || null : null,
        amountsByGrade: JSON.stringify(amountsByGrade || {}),
        hasSiblingDiscount: !!hasSiblingDiscount,
        siblingDiscountByRank: hasSiblingDiscount ? JSON.stringify(siblingDiscountByRank || {}) : null,
        sortOrder: count,
      },
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("DUES_ITEM_CREATE_ERROR", error);
    return NextResponse.json({ error: "作成に失敗しました。" }, { status: 500 });
  }
}
