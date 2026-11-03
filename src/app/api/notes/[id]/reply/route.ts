import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
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
      include: { children: { select: { id: true } } },
    });

    if (!user?.teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const note = await prisma.baseballNote.findUnique({ where: { id } });
    if (!note || note.teamId !== user.teamId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isCoach =
      user.role === "MANAGER" ||
      user.isOwner ||
      user.canManagePosts ||
      user.canManageUsers;
    const childIds = (user.children || []).map((c: { id: string }) => c.id);
    const isAuthor = note.authorId === user.id || childIds.includes(note.authorId);

    if (!isCoach && !isAuthor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const content = body.content ? String(body.content).trim() : "";
    if (!content) {
      return NextResponse.json(
        { error: "返信内容を入力してください。" },
        { status: 400 }
      );
    }

    const reply = await prisma.baseballNoteReply.create({
      data: {
        noteId: id,
        authorId: user.id,
        content,
      },
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
    });

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("POST /api/notes/[id]/reply error:", error);
    return NextResponse.json(
      { error: "返信の送信に失敗しました。" },
      { status: 500 }
    );
  }
}
