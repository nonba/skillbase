import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { newPassword } = body;

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上で設定してください。" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.user.update({
      where: { id: session.user.id },
      data: {
        password: hashedPassword,
        requiresPasswordChange: false,
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("CHANGE_PASSWORD_ERROR", error);
    return NextResponse.json({ error: "パスワードの変更に失敗しました。" }, { status: 500 });
  }
}
