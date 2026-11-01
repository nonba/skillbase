import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncGradeGroups } from "@/lib/gradeGroups";

// "4,5,6" 等に正規化（0..6の数字のみ・重複除去）。空なら null。
function normalizeGradeFilter(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const set = new Set<number>();
  raw.forEach((v) => {
    const n = parseInt(String(v), 10);
    if (!isNaN(n) && n >= 0 && n <= 6) set.add(n);
  });
  if (set.size === 0) return null;
  return Array.from(set).sort((a, b) => a - b).join(",");
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManagePosts: true, canManageUsers: true, role: true }
    });

    const isGroupAdmin = user?.isOwner || user?.canManagePosts || user?.canManageUsers || user?.role === "MANAGER";

    const groups = await db.group.findMany({
      where: { 
        teamId: session.user.teamId,
        ...(isGroupAdmin ? {} : {
          members: {
            some: { id: session.user.id }
          }
        })
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            role: true,
            jerseyNumber: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json({ groups });
  } catch (error: any) {
    console.error("Group fetch error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManageUsers: true, role: true }
    });

    if (!user?.isOwner && !user?.canManageUsers && user?.role !== "MANAGER") {
      return NextResponse.json({ error: "グループを管理する権限がありません。" }, { status: 403 });
    }

    const body = await req.json();
    const { action, name, groupId, userIds, scheduleFullAccess, grades } = body;

    if (!action) {
      return NextResponse.json({ error: "アクションが指定されていません。" }, { status: 400 });
    }

    if (action === "create") {
      if (!name) {
        return NextResponse.json({ error: "グループ名は必須です。" }, { status: 400 });
      }

      const gradeFilter = normalizeGradeFilter(grades);
      const newGroup = await db.group.create({
        data: {
          name,
          teamId: session.user.teamId!,
          gradeFilter,
        },
      });

      // 学年ベースなら、対象学年の選手を自動でメンバーに同期する
      if (gradeFilter) {
        await syncGradeGroups(session.user.teamId!, newGroup.id);
      }

      // 個別に選んだメンバーがあれば、学年自動追加分に「追加で」紐付ける（同一チームのみ）
      if (Array.isArray(userIds) && userIds.length > 0) {
        const validMembers = await db.user.findMany({
          where: { id: { in: userIds }, teamId: session.user.teamId! },
          select: { id: true },
        });
        if (validMembers.length > 0) {
          await db.group.update({
            where: { id: newGroup.id },
            data: { members: { connect: validMembers.map((m) => ({ id: m.id })) } },
          });
        }
      }

      const created = await db.group.findUnique({
        where: { id: newGroup.id },
        include: { members: { select: { id: true, name: true } } },
      });

      return NextResponse.json({
        message: "グループを作成しました。",
        group: created ?? newGroup,
      }, { status: 201 });
    }

    if (action === "updateMembers") {
      if (!groupId || !userIds || !Array.isArray(userIds)) {
        return NextResponse.json({ error: "必要な情報が不足しています。" }, { status: 400 });
      }

      const group = await db.group.findUnique({
        where: { id: groupId },
      });

      if (!group || group.teamId !== session.user.teamId) {
        return NextResponse.json({ error: "対象のグループが見つかりません。" }, { status: 404 });
      }

      const updatedGroup = await db.group.update({
        where: { id: groupId },
        data: {
          members: {
            set: userIds.map((id) => ({ id })),
          },
        },
        include: {
          members: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return NextResponse.json({
        message: "グループメンバーを更新しました。",
        group: updatedGroup,
      });
    }

    if (action === "archive" || action === "unarchive") {
      if (!groupId) {
        return NextResponse.json({ error: "グループIDが必要です。" }, { status: 400 });
      }
      const group = await db.group.findUnique({
        where: { id: groupId },
        include: { members: { select: { id: true, graduated: true } } },
      });
      if (!group || group.teamId !== session.user.teamId) {
        return NextResponse.json({ error: "対象のグループが見つかりません。" }, { status: 404 });
      }

      const updateData: any = { isArchived: action === "archive" };
      let removedGraduatedCount = 0;
      if (action === "unarchive") {
        // 再開して使い続けられるように、卒団済み(OB)になったメンバーは外して復帰させる。
        const activeMembers = group.members.filter((m) => !m.graduated);
        removedGraduatedCount = group.members.length - activeMembers.length;
        updateData.members = { set: activeMembers.map((m) => ({ id: m.id })) };
      }

      const updatedGroup = await db.group.update({
        where: { id: groupId },
        data: updateData,
        include: { members: { select: { id: true, name: true, role: true, jerseyNumber: true } } },
      });
      return NextResponse.json({
        message: action === "archive"
          ? "グループをアーカイブしました。"
          : removedGraduatedCount > 0
            ? `アーカイブを解除しました（卒団済みの${removedGraduatedCount}名は外しました）。`
            : "アーカイブを解除しました。",
        group: updatedGroup,
      });
    }

    if (action === "delete") {
      if (!groupId) {
        return NextResponse.json({ error: "グループIDが必要です。" }, { status: 400 });
      }
      const group = await db.group.findUnique({ where: { id: groupId } });
      if (!group || group.teamId !== session.user.teamId) {
        return NextResponse.json({ error: "対象のグループが見つかりません。" }, { status: 404 });
      }
      await db.group.delete({ where: { id: groupId } });
      return NextResponse.json({ message: "グループを削除しました。" });
    }

    if (action === "updateSettings") {
      if (!groupId) {
        return NextResponse.json({ error: "グループIDが必要です。" }, { status: 400 });
      }

      const group = await db.group.findUnique({ where: { id: groupId } });
      if (!group || group.teamId !== session.user.teamId) {
        return NextResponse.json({ error: "対象のグループが見つかりません。" }, { status: 404 });
      }

      const updatedGroup = await db.group.update({
        where: { id: groupId },
        data: {
          ...(typeof scheduleFullAccess === "boolean" ? { scheduleFullAccess } : {}),
        },
      });

      return NextResponse.json({ message: "グループ設定を更新しました。", group: updatedGroup });
    }

    return NextResponse.json({ error: "無効なアクションです。" }, { status: 400 });
  } catch (error: any) {
    console.error("Group manage error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
