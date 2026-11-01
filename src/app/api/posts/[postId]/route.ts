import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { postId } = await params;
    const { content } = await req.json();

    if (!content) {
      return NextResponse.json({ error: "投稿内容を入力してください。" }, { status: 400 });
    }

    const post = await db.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json({ error: "投稿が見つかりません。" }, { status: 404 });
    }

    if (post.authorId !== session.user.id) {
      return NextResponse.json({ error: "自分の投稿のみ編集できます。" }, { status: 403 });
    }

    const updatedPost = await db.post.update({
      where: { id: postId },
      data: { content },
    });

    return NextResponse.json({ message: "投稿を更新しました。", post: updatedPost });
  } catch (error: any) {
    console.error("Post update error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { postId } = await params;

    const post = await db.post.findUnique({
      where: { id: postId },
      include: { author: true },
    });

    if (!post) {
      return NextResponse.json({ error: "投稿が見つかりません。" }, { status: 404 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, canManagePosts: true, role: true },
    });

    const isPostAdmin = user?.isOwner || user?.canManagePosts || user?.role === "MANAGER";

    // 自分の投稿、または管理者であれば削除可能
    if (post.authorId !== session.user.id && !isPostAdmin) {
      return NextResponse.json({ error: "投稿を削除する権限がありません。" }, { status: 403 });
    }

    await db.post.delete({
      where: { id: postId },
    });

    return NextResponse.json({ message: "投稿を削除しました。" });
  } catch (error: any) {
    console.error("Post delete error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
