import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// システム管理者によるチーム削除(オーナー本人でなくてもチームIDを指定して削除できる)。
// ロジックは /api/team/delete (オーナー本人向け) と同じ。チーム名の完全一致確認つき。
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isSystemAdmin: true },
    });
    if (!me?.isSystemAdmin) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }

    const { id: teamId } = await params;
    const { confirmName } = await req.json();

    const team = await db.team.findUnique({
      where: { id: teamId },
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
      db.team.delete({ where: { id: team.id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Admin team delete error:", error);
    return NextResponse.json({ error: "チームの削除に失敗しました。" }, { status: 500 });
  }
}
