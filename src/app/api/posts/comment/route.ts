import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { postId, content } = await req.json();

    if (!postId || !content) {
      return NextResponse.json({ error: "必要な情報が不足しています。" }, { status: 400 });
    }

    const post = await db.post.findUnique({
      where: { id: postId },
      select: { teamId: true },
    });

    if (!post || post.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "対象の投稿が見つかりません。" }, { status: 404 });
    }

    const comment = await db.comment.create({
      data: {
        content,
        postId,
        authorId: session.user.id,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: "コメントを追加しました。",
      comment,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Comment create error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
