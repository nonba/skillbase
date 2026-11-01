import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

async function requireAdminAndItem(id: string) {
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
  const item = await db.duesFeeItem.findUnique({ where: { id } });
  if (!item || item.teamId !== session.user.teamId) {
    return { error: NextResponse.json({ error: "明細が見つかりません。" }, { status: 404 }) };
  }
  return { session, item };
}

const VALID_TIMINGS = ["ONE_TIME", "MONTHLY", "ANNUAL"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdminAndItem(id);
  if (auth.error) return auth.error;

  try {
    const { name, timing, annualMonth, amountsByGrade, hasSiblingDiscount, siblingDiscountByRank, active, sortOrder } = await req.json();
    if (timing !== undefined && !VALID_TIMINGS.includes(timing)) {
      return NextResponse.json({ error: "不正なタイミングです。" }, { status: 400 });
    }
    const updated = await db.duesFeeItem.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        timing: timing !== undefined ? timing : undefined,
        annualMonth: timing !== undefined ? (timing === "ANNUAL" ? Number(annualMonth) || null : null) : undefined,
        amountsByGrade: amountsByGrade !== undefined ? JSON.stringify(amountsByGrade) : undefined,
        hasSiblingDiscount: hasSiblingDiscount !== undefined ? !!hasSiblingDiscount : undefined,
        siblingDiscountByRank:
          hasSiblingDiscount !== undefined
            ? (hasSiblingDiscount ? JSON.stringify(siblingDiscountByRank || {}) : null)
            : undefined,
        active: active !== undefined ? !!active : undefined,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
      },
    });
    return NextResponse.json({ item: updated });
  } catch (error: any) {
    console.error("DUES_ITEM_UPDATE_ERROR", error);
    return NextResponse.json({ error: "更新に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdminAndItem(id);
  if (auth.error) return auth.error;

  try {
    await db.duesFeeItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DUES_ITEM_DELETE_ERROR", error);
    return NextResponse.json({ error: "削除に失敗しました。" }, { status: 500 });
  }
}
