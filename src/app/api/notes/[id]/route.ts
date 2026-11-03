import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { children: { select: { id: true } } },
    });

    if (!user?.teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isCoach =
      user.role === "MANAGER" ||
      user.isOwner ||
      user.canManagePosts ||
      user.canManageUsers;

    const note = await prisma.baseballNote.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            isOwner: true,
            grade: true,
            jerseyNumber: true,
          },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                isOwner: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!note || note.teamId !== user.teamId) {
      return NextResponse.json(
        { error: "野球ノートが見つかりません。" },
        { status: 404 }
      );
    }

    const childIds = (user.children || []).map((c: { id: string }) => c.id);
    const isAuthor = note.authorId === user.id || childIds.includes(note.authorId);

    if (!isCoach && !isAuthor) {
      return NextResponse.json(
        { error: "この野球ノートを閲覧する権限がありません。" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      note,
      isCoach,
      isAuthor: note.authorId === user.id,
    });
  } catch (error: any) {
    console.error("GET /api/notes/[id] error:", error);
    return NextResponse.json(
      { error: "野球ノートの取得に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user?.teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isCoach =
      user.role === "MANAGER" ||
      user.isOwner ||
      user.canManagePosts ||
      user.canManageUsers;

    if (!isCoach) {
      return NextResponse.json(
        { error: "指導者のみスタンプを押すことができます。" },
        { status: 403 }
      );
    }

    const existing = await prisma.baseballNote.findUnique({ where: { id } });
    if (!existing || existing.teamId !== user.teamId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const stamp = body.coachStamp ? String(body.coachStamp) : null;

    const updated = await prisma.baseballNote.update({
      where: { id },
      data: {
        coachStamp: stamp,
        stampedByName: stamp ? user.name : null,
      },
    });

    return NextResponse.json({ note: updated });
  } catch (error: any) {
    console.error("PUT /api/notes/[id] error:", error);
    return NextResponse.json(
      { error: "スタンプの更新に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    const existing = await prisma.baseballNote.findUnique({ where: { id } });
    if (!existing || existing.teamId !== user?.teamId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isCoach =
      user.role === "MANAGER" ||
      user.isOwner ||
      user.canManagePosts ||
      user.canManageUsers;

    if (!isCoach && existing.authorId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.baseballNote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/notes/[id] error:", error);
    return NextResponse.json(
      { error: "削除に失敗しました。" },
      { status: 500 }
    );
  }
}
