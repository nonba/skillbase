import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// HOMEBASE Attach(入団・団費管理エリア)専用の管理者アカウント一覧・追加。
// 選手・保護者アカウントとは別枠(role=MANAGER、実メールアドレスでログイン)。
// 1チームにつき最大5名まで(オーナー1名+追加管理者4名)。オーナーが直接メール/パスワードを登録する方式。
const MAX_ADMINS = 5;

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

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admins = await db.user.findMany({
    where: {
      teamId: auth.session!.user.teamId!,
      OR: [{ isOwner: true }, { role: "MANAGER" }],
      graduated: false,
    },
    select: { id: true, name: true, email: true, isOwner: true, createdAt: true },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ admins, maxAdmins: MAX_ADMINS });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "氏名・メールアドレス・パスワードは必須です。" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上で設定してください。" }, { status: 400 });
    }

    const currentCount = await db.user.count({
      where: {
        teamId: auth.session!.user.teamId!,
        OR: [{ isOwner: true }, { role: "MANAGER" }],
        graduated: false,
      },
    });
    if (currentCount >= MAX_ADMINS) {
      return NextResponse.json({ error: `管理者は最大${MAX_ADMINS}名までです。` }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "このメールアドレスはすでに使用されています。" }, { status: 400 });
    }

    const admin = await db.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: await bcrypt.hash(password, 10),
        role: "MANAGER",
        teamId: auth.session!.user.teamId!,
        requiresPasswordChange: false,
        canManageUsers: true,
      },
    });

    return NextResponse.json({ admin: { id: admin.id, name: admin.name, email: admin.email } });
  } catch (error: any) {
    console.error("ATTACH_ADMIN_CREATE_ERROR", error);
    return NextResponse.json({ error: "登録に失敗しました。" }, { status: 500 });
  }
}
