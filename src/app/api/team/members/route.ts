import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// チームメンバー一覧取得（DM機能などで使用）
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    // OB(卒団者)アカウントには、メッセージ相手として選べる指導者の名前のみ返す（名簿は非公開）。
    if ((session.user as any).graduated === true) {
      const managers = await db.user.findMany({
        where: { teamId: session.user.teamId, role: "MANAGER" },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ members: managers });
    }

    const team = await db.team.findUnique({
      where: { id: session.user.teamId },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            role: true,
            jerseyNumber: true,
            position: true,
            parents: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            },
            children: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "チームが見つかりません。" }, { status: 404 });
    }

    return NextResponse.json({ members: team.members });
  } catch (error: any) {
    console.error("Team members error:", error);
    return NextResponse.json({
      error: `サーバーエラーが発生しました: ${error.message || error}`,
    }, { status: 500 });
  }
}
