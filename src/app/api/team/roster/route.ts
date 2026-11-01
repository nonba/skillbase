import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPlayerAccountWithFamily } from "@/lib/playerAccount";

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

// 団員リスト(個人情報を含む選手プロフィール)。オーナー/マネージャーのみ閲覧可。
// 通常のメンバー一覧(/api/team/info)には出さない項目(住所・保護者連絡先・健康面等)をここでのみ返す。
export async function GET() {
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
      return NextResponse.json({ error: "閲覧する権限がありません。" }, { status: 403 });
    }
    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    const players = await db.user.findMany({
      where: { teamId: session.user.teamId, role: "PLAYER" },
      select: {
        id: true,
        name: true,
        nameKana: true,
        jerseyNumber: true,
        grade: true,
        birthDate: true,
        graduated: true,
        schoolName: true,
        guardianName: true,
        guardianRelation: true,
        guardianPhone: true,
        homeAddress: true,
        healthNotes: true,
        createdAt: true,
      },
      orderBy: [{ graduated: "asc" }, { grade: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ players });
  } catch (error: any) {
    console.error("TEAM_ROSTER_FETCH_ERROR", error);
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
}

// 団員リストからの選手登録(単独)。氏名・生年月日・学年が必須。ログインID・保護者アカウントは自動発行。
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const playerName = String(body.playerName || "").trim();
    if (!playerName) {
      return NextResponse.json({ error: "選手氏名は必須です。" }, { status: 400 });
    }
    if (!body.birthDate || body.grade === undefined || body.grade === null || body.grade === "") {
      return NextResponse.json({ error: "生年月日・学年は必須です。" }, { status: 400 });
    }
    const siblingRank = Number(body.siblingRank) || 1;

    const result = await createPlayerAccountWithFamily(auth.session!.user.teamId!, siblingRank, {
      playerName,
      playerNameKana: body.playerNameKana || null,
      grade: body.grade !== undefined && body.grade !== null && body.grade !== "" ? Number(body.grade) : null,
      birthDate: body.birthDate,
      schoolName: body.schoolName || null,
      guardianName: body.guardianName || null,
      guardianRelation: body.guardianRelation || null,
      guardianPhone: body.guardianPhone || null,
      guardianEmail: body.guardianEmail || null,
      address: body.address || null,
      healthNotes: body.healthNotes || null,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("TEAM_ROSTER_CREATE_ERROR", error);
    return NextResponse.json({ error: error?.message || "登録に失敗しました。" }, { status: 500 });
  }
}
