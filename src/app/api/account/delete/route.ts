import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// アカウント削除（本人限定・パスワード確認つき）。
// User関連のPost/Comment/Message/RSVP等はスキーマのonDelete: Cascadeで連鎖削除される
// （/account-deletion に記載の「削除される情報」に対応）。試合結果・チーム成績など
// チーム全体で共有される情報はUser直下の関連ではないため残る（同ページの案内通り）。
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { password } = await req.json();
    if (!password) {
      return NextResponse.json({ error: "パスワードを入力してください。" }, { status: 400 });
    }

    // 権限・所属は必ずDBの最新値で確認する（セッションの値は古い可能性がある）
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true, isOwner: true, teamId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません。" }, { status: 404 });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return NextResponse.json({ error: "パスワードが正しくありません。" }, { status: 400 });
    }

    if (user.isOwner && user.teamId) {
      return NextResponse.json(
        {
          error:
            "チームのオーナーのアカウントは直接削除できません。先にチーム設定画面から「チームを解散する」か、他のメンバーにオーナー権限を移譲してから削除してください。",
        },
        { status: 400 }
      );
    }

    await db.user.delete({ where: { id: user.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Account delete error:", error);
    return NextResponse.json({ error: "アカウントの削除に失敗しました。" }, { status: 500 });
  }
}
