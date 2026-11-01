import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// チーム解散（オーナー限定・チーム名の完全一致確認つき）
// 予定・投稿・グループ・会話などはスキーマのonDelete: Cascadeで連鎖削除される。
// メンバーのアカウント自体は削除せず「チーム未所属」に戻す（別チームへの参加や新チーム作成が可能）。
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.teamId) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    // 権限は必ずDBの最新値で確認する（セッションの値は古い可能性がある）
    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, teamId: true },
    });
    if (!me?.isOwner || me.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "チームを解散できるのはオーナーのみです。" }, { status: 403 });
    }

    const { confirmName } = await req.json();
    const team = await db.team.findUnique({
      where: { id: me.teamId },
      select: { id: true, name: true },
    });
    if (!team) {
      return NextResponse.json({ error: "チームが見つかりません。" }, { status: 404 });
    }

    if (!confirmName || confirmName.trim() !== team.name) {
      return NextResponse.json(
        { error: "確認用のチーム名が一致しません。正確に入力してください。" },
        { status: 400 }
      );
    }

    await db.$transaction([
      // メンバー全員をチーム未所属に戻し、チーム内権限をリセットする
      db.user.updateMany({
        where: { teamId: team.id },
        data: {
          teamId: null,
          isOwner: false,
          canManageSchedule: false,
          canManageUsers: false,
          canManagePosts: false,
          canManageScore: false,
        },
      }),
      // チーム本体を削除（予定・投稿・グループ・アルバム・会話等はCascadeで削除される）
      db.team.delete({ where: { id: team.id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Team delete error:", error);
    return NextResponse.json({ error: "チームの解散に失敗しました。" }, { status: 500 });
  }
}
