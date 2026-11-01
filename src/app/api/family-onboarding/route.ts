import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// 家族向け配布ページを発行する。一括登録/単独登録の直後に、その場でできたアカウント一覧を渡す。
// トークンは推測困難な文字列。30日で失効。
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.teamId) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    const canManage =
      (session.user as any).isOwner || (session.user as any).canManageUsers || session.user.role === "MANAGER";
    if (!canManage) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }

    const { accounts } = await req.json();
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json({ error: "アカウント情報が必要です。" }, { status: 400 });
    }

    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    await db.familyOnboarding.create({
      data: {
        token,
        teamId: session.user.teamId,
        accounts: JSON.stringify(accounts),
        expiresAt,
      },
    });

    return NextResponse.json({ token, expiresAt });
  } catch (e) {
    console.error("family-onboarding create error:", e);
    return NextResponse.json({ error: "配布ページの作成に失敗しました。" }, { status: 500 });
  }
}
