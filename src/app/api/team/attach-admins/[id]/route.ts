import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, role: true, canManageUsers: true },
    });
    if (!currentUser?.isOwner && currentUser?.role !== "MANAGER" && !currentUser?.canManageUsers) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }

    const { id } = await params;
    const target = await db.user.findUnique({ where: { id }, select: { teamId: true, isOwner: true } });
    if (!target || target.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "管理者が見つかりません。" }, { status: 404 });
    }
    if (target.isOwner) {
      return NextResponse.json({ error: "オーナーアカウントは削除できません。" }, { status: 400 });
    }
    if (id === session.user.id) {
      return NextResponse.json({ error: "自分自身は削除できません。" }, { status: 400 });
    }

    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ATTACH_ADMIN_DELETE_ERROR", error);
    return NextResponse.json({ error: "削除に失敗しました。" }, { status: 500 });
  }
}
