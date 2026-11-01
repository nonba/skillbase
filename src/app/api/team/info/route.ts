import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureTeamCode } from "@/lib/teamCode";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    const team = await db.team.findUnique({
      where: { id: session.user.teamId },
      include: {
        statsVisibleGroups: {
          select: {
            id: true,
            name: true,
          }
        },
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            jerseyNumber: true,
            position: true,
            battingHand: true,
            throwingHand: true,
            grade: true,
            graduated: true,
            parentRelation: true,
            isOwner: true,
            canManageSchedule: true,
            canManageUsers: true,
            canManagePosts: true,
            canManageScore: true,
            requiresPasswordChange: true,
            createdAt: true,
            groups: {
              select: {
                id: true,
                name: true,
                scheduleFullAccess: true,
              }
            },
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
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "チームが見つかりません。" }, { status: 404 });
    }

    // teamCodeが未設定(過去のD1移行事故等)なら、この画面を開いた時点で自動補完する。
    if (!team.teamCode) {
      team.teamCode = await ensureTeamCode(team.id);
    }

    // --- 成績公開権限の計算 ---
    let canViewStats = false;
    if (team.scorePlan !== "NONE") {
      if (session.user.role === "MANAGER") {
        canViewStats = true;
      } else if (team.statsVisibility === "ALL") {
        canViewStats = true;
      } else if (team.statsVisibility === "SPECIFIC_GROUPS") {
        // 現在のユーザーの所属グループIDを取得 (membersリストから自分を探す)
        const me = team.members.find(m => m.id === session.user.id);
        const myGroupIds = me?.groups?.map(g => g.id) || [];
        const allowedGroupIds = team.statsVisibleGroups.map(g => g.id);
        
        if (myGroupIds.some(id => allowedGroupIds.includes(id))) {
          canViewStats = true;
        }
      }
    }

    return NextResponse.json({ 
      team,
      canViewStats
    });
  } catch (error: any) {
    console.error("Team info error:", error);
    return NextResponse.json({ 
      error: `サーバーエラーが発生しました: ${error.message || error}`, 
      stack: error.stack 
    }, { status: 500 });
  }
}
