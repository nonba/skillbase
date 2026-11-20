import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET: 招待コードからチーム情報を確認する
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: "招待コードが必要です。" }, { status: 400 });
    }

    const team = await db.team.findUnique({
      where: { inviteCode: code },
      select: {
        id: true,
        name: true,
        teamCode: true,
        category: true,
        ballType: true,
        maxUsers: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: "該当するチームが見つかりません。招待コードをご確認ください。" }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error: any) {
    console.error("Get manager invite team error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

// POST: オーナー決定(2026-11-20)により、SKILLBASE 自前のログインで新規ユーザーを作らない
export async function POST() {
  return NextResponse.json(
    { error: "SKILLBASE では独自の新規ユーザー登録を行っていません。BASE アカウントでログインしてからチームに参加してください。" },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}
