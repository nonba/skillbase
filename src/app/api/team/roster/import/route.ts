import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPlayerAccountWithFamily } from "@/lib/playerAccount";

// CSV一括登録(団員リストから)。行ごとに選手アカウント+保護者アカウントを作成する。
// D1はインタラクティブトランザクション非対応のため、既存のbulk-createと同様に1行ずつ順次実行する。
export async function POST(req: Request) {
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
    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    const { rows } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "登録する行がありません。" }, { status: 400 });
    }
    if (rows.length > 100) {
      return NextResponse.json({ error: "一度に登録できるのは100件までです。分割してください。" }, { status: 400 });
    }

    const results: { row: number; playerName: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const playerName = String(row.playerName || "").trim();
      if (!playerName) {
        results.push({ row: i + 1, playerName: "", success: false, error: "氏名が空です。" });
        continue;
      }
      if (!row.birthDate || row.grade === undefined || row.grade === null || row.grade === "") {
        results.push({ row: i + 1, playerName, success: false, error: "生年月日・学年は必須です。" });
        continue;
      }
      try {
        await createPlayerAccountWithFamily(session.user.teamId, Number(row.siblingRank) || 1, {
          playerName,
          playerNameKana: row.playerNameKana || null,
          grade: row.grade !== undefined && row.grade !== null && row.grade !== "" ? Number(row.grade) : null,
          birthDate: row.birthDate,
          schoolName: row.schoolName || null,
          guardianName: row.guardianName || null,
          guardianRelation: row.guardianRelation || null,
          guardianPhone: row.guardianPhone || null,
          guardianEmail: row.guardianEmail || null,
          address: row.address || null,
          healthNotes: row.healthNotes || null,
          jerseyNumber: row.jerseyNumber || null,
        });
        results.push({ row: i + 1, playerName, success: true });
      } catch (err: any) {
        results.push({ row: i + 1, playerName, success: false, error: err?.message || "登録に失敗しました。" });
      }
    }

    return NextResponse.json({
      results,
      summary: { total: results.length, success: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length },
    });
  } catch (error: any) {
    console.error("TEAM_ROSTER_IMPORT_ERROR", error);
    return NextResponse.json({ error: "一括登録に失敗しました。" }, { status: 500 });
  }
}
