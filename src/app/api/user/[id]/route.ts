import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// 団員リスト項目(住所・保護者連絡先・健康面等)の編集。個人情報のため、対象が自分自身でも
// 常にオーナー/マネージャー権限を要求する(通常のプロフィール編集/api/user/updateとは別枠)。
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
      return NextResponse.json({ error: "編集する権限がありません。" }, { status: 403 });
    }

    const { id } = await params;
    const target = await db.user.findUnique({ where: { id }, select: { teamId: true, role: true } });
    if (!target || target.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "選手が見つかりません。" }, { status: 404 });
    }
    if (target.role !== "PLAYER") {
      return NextResponse.json({ error: "団員リストの編集対象は選手のみです。" }, { status: 400 });
    }

    const { nameKana, schoolName, guardianName, guardianRelation, guardianPhone, homeAddress, healthNotes } = await req.json();
    const VALID_RELATIONS = ["FATHER", "MOTHER", "OTHER"];

    const updated = await db.user.update({
      where: { id },
      data: {
        nameKana: nameKana !== undefined ? (nameKana || null) : undefined,
        schoolName: schoolName !== undefined ? (schoolName || null) : undefined,
        guardianName: guardianName !== undefined ? (guardianName || null) : undefined,
        guardianRelation:
          guardianRelation !== undefined ? (VALID_RELATIONS.includes(guardianRelation) ? guardianRelation : null) : undefined,
        guardianPhone: guardianPhone !== undefined ? (guardianPhone || null) : undefined,
        homeAddress: homeAddress !== undefined ? (homeAddress || null) : undefined,
        healthNotes: healthNotes !== undefined ? (healthNotes || null) : undefined,
      },
    });

    return NextResponse.json({ player: updated });
  } catch (error: any) {
    console.error("ROSTER_DETAIL_UPDATE_ERROR", error);
    return NextResponse.json({ error: "更新に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const userIdToDelete = resolvedParams.id;

    // 現在のユーザー情報を取得して権限を確認
    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, isOwner: true, canManageUsers: true, teamId: true }
    });

    if (!currentUser || !currentUser.teamId) {
      return NextResponse.json({ error: "チームに所属していません" }, { status: 403 });
    }

    const canDelete = currentUser.role === "MANAGER" || currentUser.isOwner || currentUser.canManageUsers;
    if (!canDelete) {
      return NextResponse.json({ error: "ユーザーを削除する権限がありません" }, { status: 403 });
    }

    // 削除対象のユーザーが同じチームか確認
    const userToDelete = await db.user.findUnique({
      where: { id: userIdToDelete }
    });

    if (!userToDelete || userToDelete.teamId !== currentUser.teamId) {
      return NextResponse.json({ error: "指定されたユーザーが見つかりません" }, { status: 404 });
    }

    // 自分自身は削除できないようにする
    if (userToDelete.id === currentUser.id) {
      return NextResponse.json({ error: "自分自身を削除することはできません" }, { status: 400 });
    }

    // ユーザーを削除
    await db.user.delete({
      where: { id: userIdToDelete }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "ユーザーの削除に失敗しました" }, { status: 500 });
  }
}
