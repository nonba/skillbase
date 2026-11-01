import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 選手（子）に、既存の家族を「後から」紐付ける。新規アカウントは作らない。
//  - siblingId: 既存の兄弟(選手)の"有効化済み"保護者を、この選手にも引き継ぐ
//  - personId:  既存の保護者/指導者を、この選手の家族として直接紐付ける
// 実在(有効化済み=requiresPasswordChange===false)の保護者は選手1人につき2名まで。
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canManage =
      (session.user as any).isOwner || (session.user as any).canManageUsers || session.user.role === "MANAGER";
    if (!canManage || !session.user.teamId) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }

    const { playerId, siblingId, personId } = await req.json();
    if (!playerId) return NextResponse.json({ error: "playerId が必要です。" }, { status: 400 });

    const player = await db.user.findFirst({
      where: { id: playerId, teamId: session.user.teamId, role: "PLAYER" },
      include: { parents: { select: { id: true, role: true, requiresPasswordChange: true } } },
    });
    if (!player) return NextResponse.json({ error: "対象の選手が見つかりません。" }, { status: 404 });

    const alreadyIds = new Set(player.parents.map((p) => p.id));
    // 現在の"実在(有効化済み)保護者(PARENT)"数（指導者MANAGERは枠に数えない）
    const activatedParentCount = player.parents.filter(
      (p) => p.role === "PARENT" && p.requiresPasswordChange === false
    ).length;

    // 紐付け候補の人物IDを決める
    let toConnect: string[] = [];

    if (siblingId) {
      const sibling = await db.user.findFirst({
        where: { id: siblingId, teamId: session.user.teamId, role: "PLAYER" },
        include: { parents: { select: { id: true, role: true, requiresPasswordChange: true } } },
      });
      if (!sibling) return NextResponse.json({ error: "兄弟の選手が見つかりません。" }, { status: 404 });
      // 兄弟の"有効化済み"保護者(PARENT)＋指導者を引き継ぐ（未紐付けのみ）
      const carry = sibling.parents.filter(
        (p) => !alreadyIds.has(p.id) && (p.role === "MANAGER" || p.requiresPasswordChange === false)
      );
      // 実在保護者の2名上限を尊重
      let room = Math.max(0, 2 - activatedParentCount);
      for (const p of carry) {
        if (p.role === "PARENT") {
          if (room <= 0) continue;
          room--;
        }
        toConnect.push(p.id);
      }
      if (toConnect.length === 0) {
        return NextResponse.json({ error: "引き継げる家族がいません（既に紐付け済み、または枠が一杯）。" }, { status: 400 });
      }
    } else if (personId) {
      const person = await db.user.findFirst({
        where: { id: personId, teamId: session.user.teamId },
        select: { id: true, role: true, requiresPasswordChange: true },
      });
      if (!person || (person.role !== "PARENT" && person.role !== "MANAGER")) {
        return NextResponse.json({ error: "紐付けできるのは保護者・指導者のみです。" }, { status: 400 });
      }
      if (alreadyIds.has(person.id)) {
        return NextResponse.json({ error: "その方はすでに家族として紐付いています。" }, { status: 400 });
      }
      if (person.role === "PARENT" && person.requiresPasswordChange === false && activatedParentCount >= 2) {
        return NextResponse.json({ error: "実在の保護者は2名までです。1人外してから紐付けてください。" }, { status: 400 });
      }
      toConnect = [person.id];
    } else {
      return NextResponse.json({ error: "siblingId か personId が必要です。" }, { status: 400 });
    }

    await db.user.update({
      where: { id: player.id },
      data: { parents: { connect: toConnect.map((id) => ({ id })) } },
    });

    return NextResponse.json({ success: true, linked: toConnect.length });
  } catch (e) {
    console.error("link-family error:", e);
    return NextResponse.json({ error: "紐付けに失敗しました。" }, { status: 500 });
  }
}
