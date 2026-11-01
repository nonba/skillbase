import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// 他チームのプロフィールを閲覧するための読み取り専用API。
// ログイン済みの(HOMEBASEを使っている)ユーザーであれば、所属チームに関わらず閲覧できる。
// isProfilePublicがfalseのチームは非公開として扱う（選手名簿等は一切含まない）。
export async function GET(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { teamId } = await params;
    const team = await db.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        ballType: true,
        homeGround: true,
        snsLinks: true,
        isProfilePublic: true,
      },
    });

    if (!team || !team.isProfilePublic) {
      return NextResponse.json({ error: "このプロフィールは非公開か、見つかりませんでした。" }, { status: 404 });
    }

    let snsLinks: { label: string; url: string }[] = [];
    try {
      const parsed = JSON.parse(team.snsLinks || "[]");
      if (Array.isArray(parsed)) snsLinks = parsed;
    } catch {
      snsLinks = [];
    }

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        category: team.category,
        ballType: team.ballType,
        homeGround: team.homeGround,
        snsLinks,
      },
    });
  } catch (error) {
    console.error("[TEAM_PROFILE_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
