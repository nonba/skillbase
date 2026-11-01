import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isColumnVisibleToUser } from "../route";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.teamId) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isOwner: true,
        canManagePosts: true,
        grade: true,
        groups: { select: { id: true } },
        children: {
          select: {
            id: true,
            grade: true,
            groups: { select: { id: true } },
          },
        },
      },
    });

    if (!me) {
      return NextResponse.json({ error: "ユーザーが見つかりません。" }, { status: 404 });
    }

    const isCoach = Boolean(me.isOwner || me.canManagePosts || me.role === "MANAGER");

    const column = await db.column.findFirst({
      where: { id, teamId: session.user.teamId },
      include: {
        author: { select: { id: true, name: true, role: true } },
        targetGroups: {
          select: {
            id: true,
            name: true,
            members: { select: { id: true, name: true, jerseyNumber: true, grade: true, role: true } },
          },
        },
        targetUsers: {
          select: { id: true, name: true, jerseyNumber: true, grade: true, role: true },
        },
        reads: {
          include: {
            user: {
              select: { id: true, name: true, jerseyNumber: true, grade: true, role: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        bookmarks: {
          where: { userId: me.id },
          select: { userId: true },
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, role: true, jerseyNumber: true, grade: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!column) {
      return NextResponse.json({ error: "コラムが見つかりません。" }, { status: 404 });
    }

    const relevantUserIds = new Set<string>([me.id, ...me.children.map((c) => c.id)]);
    const relevantGrades = new Set<number>(
      [me.grade, ...me.children.map((c) => c.grade)].filter(
        (g): g is number => g !== null && g !== undefined
      )
    );
    const relevantGroupIds = new Set<string>([
      ...me.groups.map((g) => g.id),
      ...me.children.flatMap((c) => c.groups.map((g) => g.id)),
    ]);

    if (
      !isColumnVisibleToUser(column, {
        userId: me.id,
        isCoach,
        relevantUserIds,
        relevantGrades,
        relevantGroupIds,
      })
    ) {
      return NextResponse.json({ error: "このコラムの閲覧権限がありません。" }, { status: 403 });
    }

    // 指導者向け: 対象選手のうち「誰が見たか / まだ見ていないか」を算出
    let unreadPlayers: { id: string; name: string; jerseyNumber: string | null; grade: number | null }[] = [];
    if (isCoach) {
      const allTeamPlayers = await db.user.findMany({
        where: {
          teamId: session.user.teamId,
          role: "PLAYER",
          graduated: false,
        },
        select: {
          id: true,
          name: true,
          jerseyNumber: true,
          grade: true,
          groups: { select: { id: true } },
        },
        orderBy: [{ grade: "desc" }, { name: "asc" }],
      });

      const readUserIds = new Set(column.reads.map((r) => r.userId));
      const targetGradesNums = (column.targetGrades || "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      const targetGroupIdSet = new Set(column.targetGroups.map((g) => g.id));
      const targetUserIdSet = new Set(column.targetUsers.map((u) => u.id));

      const expectedPlayers = allTeamPlayers.filter((p) => {
        if (column.targetType === "ALL") return true;
        if (column.targetType === "GRADES") {
          return p.grade !== null && targetGradesNums.includes(p.grade);
        }
        if (column.targetType === "GROUPS") {
          return p.groups.some((g) => targetGroupIdSet.has(g.id));
        }
        if (column.targetType === "USERS") {
          return targetUserIdSet.has(p.id);
        }
        return true;
      });

      unreadPlayers = expectedPlayers
        .filter((p) => !readUserIds.has(p.id))
        .map(({ id, name, jerseyNumber, grade }) => ({ id, name, jerseyNumber, grade }));
    }

    return NextResponse.json({
      column: {
        ...column,
        isRead: column.reads.some((r) => r.userId === me.id),
        isBookmarked: column.bookmarks.length > 0,
        unreadPlayers,
      },
      isCoach,
    });
  } catch (error: any) {
    console.error("Column detail GET error:", error);
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.teamId) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManagePosts: true, role: true },
    });
    const isCoach = Boolean(me?.isOwner || me?.canManagePosts || me?.role === "MANAGER");
    if (!isCoach) {
      return NextResponse.json({ error: "編集権限がありません。" }, { status: 403 });
    }

    const existing = await db.column.findFirst({
      where: { id, teamId: session.user.teamId },
    });
    if (!existing) {
      return NextResponse.json({ error: "コラムが見つかりません。" }, { status: 404 });
    }

    const body = await req.json();
    const {
      title,
      content,
      category,
      youtubeUrl,
      videoUrl,
      imageUrl,
      thumbnailUrl,
      fileUrl,
      fileName,
      isPinned,
      allowComments,
      targetType,
      targetGrades,
      targetGroupIds,
      targetUserIds,
    } = body;

    const normalizedTargetType = ["ALL", "GRADES", "GROUPS", "USERS"].includes(targetType)
      ? targetType
      : existing.targetType;

    const gradesStr =
      normalizedTargetType === "GRADES" && Array.isArray(targetGrades)
        ? targetGrades.map((g: any) => String(g)).join(",")
        : typeof targetGrades === "string"
        ? targetGrades
        : null;

    const updated = await db.column.update({
      where: { id },
      data: {
        title: title !== undefined ? String(title).trim() : existing.title,
        content: content !== undefined ? String(content) : existing.content,
        category: category !== undefined ? category : existing.category,
        youtubeUrl: youtubeUrl !== undefined ? (youtubeUrl ? String(youtubeUrl).trim() : null) : existing.youtubeUrl,
        videoUrl: videoUrl !== undefined ? videoUrl || null : existing.videoUrl,
        imageUrl: imageUrl !== undefined ? imageUrl || null : existing.imageUrl,
        thumbnailUrl: thumbnailUrl !== undefined ? thumbnailUrl || null : existing.thumbnailUrl,
        fileUrl: fileUrl !== undefined ? fileUrl || null : existing.fileUrl,
        fileName: fileName !== undefined ? fileName || null : existing.fileName,
        isPinned: isPinned !== undefined ? Boolean(isPinned) : existing.isPinned,
        allowComments: allowComments !== undefined ? Boolean(allowComments) : existing.allowComments,
        targetType: normalizedTargetType,
        targetGrades: gradesStr,
        targetGroups:
          Array.isArray(targetGroupIds)
            ? {
                set:
                  normalizedTargetType === "GROUPS"
                    ? targetGroupIds.map((gid: string) => ({ id: gid }))
                    : [],
              }
            : undefined,
        targetUsers:
          Array.isArray(targetUserIds)
            ? {
                set:
                  normalizedTargetType === "USERS"
                    ? targetUserIds.map((uid: string) => ({ id: uid }))
                    : [],
              }
            : undefined,
      },
    });

    return NextResponse.json({ column: updated });
  } catch (error: any) {
    console.error("Column PUT error:", error);
    return NextResponse.json({ error: "更新に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.teamId) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManagePosts: true, role: true },
    });
    const isCoach = Boolean(me?.isOwner || me?.canManagePosts || me?.role === "MANAGER");
    if (!isCoach) {
      return NextResponse.json({ error: "削除権限がありません。" }, { status: 403 });
    }

    await db.column.deleteMany({
      where: { id, teamId: session.user.teamId },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Column DELETE error:", error);
    return NextResponse.json({ error: "削除に失敗しました。" }, { status: 500 });
  }
}
