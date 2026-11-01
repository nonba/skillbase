import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { inviteCode } = await req.json();

    if (!inviteCode) {
      return NextResponse.json({ error: "招待コードを入力してください。" }, { status: 400 });
    }

    const code = inviteCode.trim().toUpperCase();

    const team = await db.team.findUnique({
      where: { inviteCode: code },
    });

    if (!team) {
      return NextResponse.json({ error: "無効な招待コードです。チームが見つかりません。" }, { status: 404 });
    }

    // チームメンバー全員を取得し、アクティブ課金枠人数を計算する
    const members = await db.user.findMany({
      where: { teamId: team.id },
      include: {
        children: { select: { id: true } }
      }
    });

    // 選手(PLAYER)ごとの親(PARENT)マップを構築
    const playerToParentsMap = new Map<string, Set<string>>();
    members.forEach(member => {
      if (member.role === "PARENT") {
        member.children.forEach(child => {
          if (!playerToParentsMap.has(child.id)) {
            playerToParentsMap.set(child.id, new Set());
          }
          playerToParentsMap.get(child.id)!.add(member.id);
        });
      }
    });

    // 無料枠（選手1人あたり親2人まで）に該当する親のIDセット
    const freeParents = new Set<string>();
    playerToParentsMap.forEach((parentIds) => {
      const parentArray = Array.from(parentIds);
      parentArray.slice(0, 2).forEach(parentId => {
        freeParents.add(parentId);
      });
    });

    // 有料（カウント）対象者数を算出
    let activeMemberCount = 0;
    members.forEach(member => {
      if (member.role === "PLAYER" || member.role === "MANAGER") {
        activeMemberCount++;
      } else if (member.role === "PARENT") {
        if (!freeParents.has(member.id)) {
          activeMemberCount++;
        }
      }
    });

    if (activeMemberCount >= team.maxUsers) {
      return NextResponse.json({
        error: `チームの登録人数上限（最大 ${team.maxUsers} 人）に達しているため、これ以上参加できません。管理者に連絡してください。`
      }, { status: 400 });
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { teamId: team.id },
    });

    return NextResponse.json({
      message: "チームに参加しました。",
      team,
    });
  } catch (error: any) {
    console.error("Team join error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
