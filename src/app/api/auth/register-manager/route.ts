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

// POST: 指導者として新規登録してチームに参加する
export async function POST(req: Request) {
  try {
    const { inviteCode, name, email, password } = await req.json();

    if (!inviteCode || !name || !email || !password) {
      return NextResponse.json(
        { error: "すべての必須項目を入力してください。" },
        { status: 400 }
      );
    }

    const code = String(inviteCode).trim().toUpperCase();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください。" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "パスワードは6文字以上で設定してください。" },
        { status: 400 }
      );
    }

    const team = await db.team.findUnique({
      where: { inviteCode: code },
      include: {
        members: {
          where: { graduated: false },
          select: { id: true, role: true, children: { select: { id: true } } },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: "有効なチームが見つかりません。招待コードをご確認ください。" },
        { status: 404 }
      );
    }

    // メールアドレス重複チェック
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています。ログイン画面からログインしてください。" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();

    // 指導者（MANAGER）としてユーザー作成
    const user = await db.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: "MANAGER",
        teamId: team.id,
        isOwner: false,
        canManageSchedule: true,
        canManageScore: true,
        canManagePosts: true,
        canManageUsers: false, // メンバー編集権限はオーナーが後から付与可能
        requiresPasswordChange: false,
        emailVerifiedAt: now, // 招待された指導者のため即時有効化
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
      },
    });

    return NextResponse.json(
      {
        message: "指導者としてチームに登録しました！",
        user,
        teamName: team.name,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Register manager error:", error);
    return NextResponse.json(
      { error: "登録処理中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}
