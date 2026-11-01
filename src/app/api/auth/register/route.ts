import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";

// このエンドポイントは「チームに未所属の新規オーナー（監督・代表者）」の自己登録専用。
// 請求連絡先になる本人なので実メールアドレスを必須にする。選手・保護者は引き続き
// チーム管理者がロステージから作成する（メール不要）ため、ここでは role を常に MANAGER 固定にする。
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "必要な項目が入力されていません。" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください。" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "パスワードは6文字以上で入力してください。" },
        { status: 400 }
      );
    }

    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています。" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const emailVerificationToken = crypto.randomBytes(24).toString("base64url");

    const user = await db.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: "MANAGER",
        requiresPasswordChange: false,
        emailVerificationToken,
      },
    });

    // ここではログインさせない——メール内のリンクを踏んで確認が完了するまでは
    // ログインできない仕様(請求連絡先になるオーナーのメールアドレスが実在することを登録の入口で保証するため)。
    // (このWorkers環境にはctx.waitUntil相当の確立された仕組みがないため、応答前に確実にawaitする)
    try {
      await sendVerificationEmail(user.email, user.name, emailVerificationToken);
    } catch (e) {
      console.error("verification email failed:", e);
    }

    return NextResponse.json(
      { message: "確認メールを送信しました。", pending_verification: true, email: user.email },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
