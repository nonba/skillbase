import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: columnId } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { content } = await req.json();
    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: "コメントを入力してください。" }, { status: 400 });
    }

    const column = await db.column.findUnique({
      where: { id: columnId },
      select: { allowComments: true },
    });

    if (!column) {
      return NextResponse.json({ error: "コラムが見つかりません。" }, { status: 404 });
    }
    if (!column.allowComments) {
      return NextResponse.json({ error: "このコラムはコメントを受け付けていません。" }, { status: 403 });
    }

    const comment = await db.columnComment.create({
      data: {
        columnId,
        authorId: session.user.id,
        content: String(content).trim(),
      },
      include: {
        author: {
          select: { id: true, name: true, role: true, jerseyNumber: true, grade: true },
        },
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error: any) {
    console.error("Column comment POST error:", error);
    return NextResponse.json({ error: "コメントの送信に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  _context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");
    if (!commentId) {
      return NextResponse.json({ error: "コメントIDが必要です。" }, { status: 400 });
    }

    const existing = await db.columnComment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "コメントが見つかりません。" }, { status: 404 });
    }

    const isCoach =
      (session.user as any).isOwner ||
      (session.user as any).canManagePosts ||
      session.user.role === "MANAGER";

    if (existing.authorId !== session.user.id && !isCoach) {
      return NextResponse.json({ error: "削除権限がありません。" }, { status: 403 });
    }

    await db.columnComment.delete({ where: { id: commentId } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Column comment DELETE error:", error);
    return NextResponse.json({ error: "削除に失敗しました。" }, { status: 500 });
  }
}
