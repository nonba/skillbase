import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return false;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSystemAdmin: true },
  });
  return !!user?.isSystemAdmin;
}

// クーポン発行
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const code = String(body.code || "").trim().toUpperCase();
    const discountPercent = Math.max(1, Math.min(100, parseInt(body.discountPercent, 10) || 0));
    const durationMonths = body.durationMonths ? Math.max(1, parseInt(body.durationMonths, 10)) : null;
    const description = body.description ? String(body.description).trim() : null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const maxRedemptions = body.maxRedemptions ? Math.max(1, parseInt(body.maxRedemptions, 10)) : null;
    const fullyExempt = Boolean(body.fullyExempt) && discountPercent === 100;

    if (!code) {
      return NextResponse.json({ error: "コードを入力してください" }, { status: 400 });
    }
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      return NextResponse.json({ error: "コードは英数字・ハイフン・アンダースコア 3〜32文字" }, { status: 400 });
    }
    if (!discountPercent) {
      return NextResponse.json({ error: "割引率(1〜100)を入力してください" }, { status: 400 });
    }
    const existing = await db.coupon.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "そのコードは既に存在します" }, { status: 409 });
    }
    const coupon = await db.coupon.create({
      data: { code, discountPercent, durationMonths, description, expiresAt, maxRedemptions, fullyExempt },
    });
    return NextResponse.json({ coupon });
  } catch (e) {
    console.error("Coupon create error:", e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

// クーポン編集（有効切替＋各項目の修正。渡された項目だけ更新）
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const id = String(body.id);
    if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.discountPercent !== undefined) data.discountPercent = Math.max(1, Math.min(100, parseInt(body.discountPercent, 10) || 0));
    if (body.durationMonths !== undefined) data.durationMonths = body.durationMonths ? Math.max(1, parseInt(body.durationMonths, 10)) : null;
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.maxRedemptions !== undefined) data.maxRedemptions = body.maxRedemptions ? Math.max(1, parseInt(body.maxRedemptions, 10)) : null;
    if (body.fullyExempt !== undefined) {
      const effectiveDiscount = body.discountPercent !== undefined ? (data.discountPercent as number) : undefined;
      data.fullyExempt = Boolean(body.fullyExempt) && (effectiveDiscount === undefined || effectiveDiscount === 100);
    }
    if (body.code !== undefined) {
      const code = String(body.code).trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
        return NextResponse.json({ error: "コードは英数字・ハイフン・アンダースコア 3〜32文字" }, { status: 400 });
      }
      const existing = await db.coupon.findUnique({ where: { code } });
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "そのコードは既に存在します" }, { status: 409 });
      }
      data.code = code;
    }
    await db.coupon.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Coupon update error:", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

// クーポン削除（適用中チームがあれば先に外してから削除）
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    // 適用中チームのクーポン参照を外す（D1はカスケード非依存のため明示的に）
    await db.team.updateMany({
      where: { couponId: id },
      data: { couponId: null, couponAppliedAt: null },
    });
    await db.coupon.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Coupon delete error:", e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
