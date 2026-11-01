import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// 紛らわしい文字を除いた仮パスワードを生成する
const TEMP_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
function genTempPassword(len = 8): string {
  let out = "";
  const arr = new Uint32Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += TEMP_CHARS[arr[i] % TEMP_CHARS.length];
  } else {
    for (let i = 0; i < len; i++) out += TEMP_CHARS[Math.floor(Math.random() * TEMP_CHARS.length)];
  }
  return out;
}

export async function POST(req: Request) {
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

    const body = await req.json();
    const userId = String(body?.userId || "").trim();
    if (!userId) {
      return NextResponse.json({ error: "対象ユーザーが指定されていません。" }, { status: 400 });
    }

    // 対象が同じチームのメンバーか確認（他チームの操作を防ぐ）
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, teamId: true, isOwner: true },
    });
    if (!target || target.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません。" }, { status: 404 });
    }
    // オーナーの仮パス再発行は本人以外に許可しない（乗っ取り防止）
    if (target.isOwner && target.id !== (session.user as any).id) {
      return NextResponse.json({ error: "オーナーアカウントの仮パスワードは再発行できません。" }, { status: 403 });
    }

    const tempPassword = genTempPassword();
    await db.user.update({
      where: { id: target.id },
      data: {
        password: await bcrypt.hash(tempPassword, 10),
        requiresPasswordChange: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: { id: target.id, name: target.name, loginId: target.email },
      tempPassword,
    });
  } catch (error: any) {
    console.error("RESET_TEMP_PASSWORD_ERROR", error);
    return NextResponse.json({ error: "仮パスワードの再発行に失敗しました。", details: String(error?.message || error) }, { status: 500 });
  }
}
