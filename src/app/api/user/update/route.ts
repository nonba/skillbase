import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { filterUserIdsInTeam } from "@/lib/tenant";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const body = await req.json();
    const { userId, name, role, jerseyNumber, position, battingHand, throwingHand, grade, parentRelation, canManageSchedule, canManageUsers, canManagePosts, canManageScore } = body;
    // 家族の紐付け対象は、必ず同じチームのユーザーに限定する（他チームのユーザーを紐付けさせない）
    const parentIds = Array.isArray(body.parentIds) ? await filterUserIdsInTeam(body.parentIds, session.user.teamId) : undefined;
    const childrenIds = Array.isArray(body.childrenIds) ? await filterUserIdsInTeam(body.childrenIds, session.user.teamId) : undefined;

    const targetUserId = userId || session.user.id;

    // 現在のユーザー情報を取得して権限をチェック
    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManageUsers: true, role: true }
    });

    const isUserAdmin = currentUser?.isOwner || currentUser?.canManageUsers || currentUser?.role === "MANAGER";

    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { teamId: true, isOwner: true, role: true },
    });

    if (!targetUser || targetUser.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "ユーザーが見つからないか、チームが異なります。" }, { status: 404 });
    }

    if (targetUserId !== session.user.id && !isUserAdmin) {
      return NextResponse.json({ error: "他のメンバーの情報を編集する権限がありません。" }, { status: 403 });
    }

    const VALID_RELATIONS = ["FATHER", "MOTHER", "OTHER"];
    const updateData: any = {
      name: (name !== undefined && typeof name === "string" && name.trim()) ? name.trim() : undefined,
      jerseyNumber: jerseyNumber !== undefined ? jerseyNumber : undefined,
      position: position !== undefined ? position : undefined,
      grade: grade !== undefined ? (grade === null || grade === "" ? null : Number(grade)) : undefined,
      battingHand: battingHand !== undefined ? battingHand : undefined,
      throwingHand: throwingHand !== undefined ? throwingHand : undefined,
      parentRelation: parentRelation !== undefined ? (VALID_RELATIONS.includes(parentRelation) ? parentRelation : null) : undefined,
    };

    // ロール変更（管理者のみ。保護者 ⇄ 指導者の変更を許可。オーナーは変更不可）
    if (isUserAdmin && role && (role === "MANAGER" || role === "PARENT")) {
      if (!targetUser.isOwner) {
        updateData.role = role;
        if (role === "MANAGER") {
          updateData.position = position || "コーチ";
          updateData.parentRelation = null;
        } else if (role === "PARENT") {
          updateData.position = null;
          updateData.canManageSchedule = false;
          updateData.canManageUsers = false;
          updateData.canManagePosts = false;
          updateData.canManageScore = false;
        }
      }
    }

    // 権限フラグの更新 (管理者のみ可能。指導者アカウントの場合のみ反映)
    const effectiveRole = updateData.role || targetUser.role;
    if (isUserAdmin && effectiveRole === "MANAGER") {
      if (canManageSchedule !== undefined) updateData.canManageSchedule = canManageSchedule;
      if (canManageUsers !== undefined) updateData.canManageUsers = canManageUsers;
      if (canManagePosts !== undefined) updateData.canManagePosts = canManagePosts;
      if (canManageScore !== undefined) updateData.canManageScore = canManageScore;
    }

    // 家族（保護者）の紐付けは選手1名につき「実在（有効化済み）2名」まで。
    // 未ログインの仮アカは数に入れない（掃除で片付くため）。
    if (parentIds && Array.isArray(parentIds)) {
      // 指定された親のうち、有効化済み（初ログイン済み）の人数を数える
      const chosen = await db.user.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, requiresPasswordChange: true },
      });
      const activatedChosen = chosen.filter((p) => p.requiresPasswordChange === false).length;
      if (activatedChosen > 2) {
        return NextResponse.json({ error: "保護者の紐付けは選手1名につき最大2名までです。" }, { status: 400 });
      }
      updateData.parents = {
        set: parentIds.map((id: string) => ({ id }))
      };
    }

    if (childrenIds && Array.isArray(childrenIds)) {
      // 保護者側から子（選手）を紐付ける場合も、各選手の「実在の親」が2名を超えないか確認する。
      // この編集対象(targetUserId)が有効化済みなら+1として数える。
      const editor = await db.user.findUnique({
        where: { id: targetUserId },
        select: { requiresPasswordChange: true },
      });
      const editorIsActivated = editor?.requiresPasswordChange === false;
      const isParentRole = (updateData.role || targetUser.role) === "PARENT";

      for (const childId of childrenIds) {
        const child = await db.user.findUnique({
          where: { id: childId },
          select: { name: true, parents: { select: { id: true, role: true, requiresPasswordChange: true } } },
        });
        if (!child) continue;
        const otherActivatedParents = child.parents.filter(
          (p) => p.id !== targetUserId && p.role === "PARENT" && p.requiresPasswordChange === false
        ).length;
        if (isParentRole && otherActivatedParents + (editorIsActivated ? 1 : 0) > 2) {
          return NextResponse.json(
            { error: `「${child.name}」さんには既に有効な保護者が2名います。先にどちらかを外してください。` },
            { status: 400 }
          );
        }
      }
      updateData.children = {
        set: childrenIds.map((id: string) => ({ id }))
      };
    }

    const updatedUser = await db.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    // 学年を変更したら、学年ベースの配信グループの所属を再同期
    if (grade !== undefined && updatedUser.teamId) {
      const { syncGradeGroups } = await import("@/lib/gradeGroups");
      await syncGradeGroups(updatedUser.teamId);
    }

    return NextResponse.json({
      message: "プロフィールを更新しました。",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        jerseyNumber: updatedUser.jerseyNumber,
        position: updatedUser.position,
        battingHand: updatedUser.battingHand,
        throwingHand: updatedUser.throwingHand,
      },
    });
  } catch (error: any) {
    console.error("User update error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
