import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import crypto from "crypto";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { email, new_email } = await req.json();
    const currentEmail = String(email || "").trim().toLowerCase();
    const newEmail = String(new_email || "").trim().toLowerCase();
    const emailToUse = newEmail || currentEmail;

    if (!EMAIL_REGEX.test(emailToUse)) {
      return NextResponse.json({ error: "有効なメールアドレスを入力してください。" }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: { email: currentEmail, emailVerificationToken: { not: null } },
    });
    if (!user) {
      return NextResponse.json({ error: "確認待ちのアカウントが見つかりません。" }, { status: 404 });
    }

    if (newEmail && newEmail !== currentEmail) {
      const taken = await db.user.findUnique({ where: { email: newEmail } });
      if (taken) {
        return NextResponse.json({ error: "このメールアドレスは既に使われています。" }, { status: 409 });
      }
    }

    const newToken = crypto.randomBytes(24).toString("base64url");
    await db.user.update({
      where: { id: user.id },
      data: { email: emailToUse, emailVerificationToken: newToken },
    });

    await sendVerificationEmail(emailToUse, user.name, newToken);

    return NextResponse.json({ success: true, email: emailToUse });
  } catch (e) {
    console.error("resend-verification error:", e);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
