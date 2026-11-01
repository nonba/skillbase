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

    const { postId } = await req.json();

    if (!postId) {
      return NextResponse.json({ error: "投稿IDは必須です。" }, { status: 400 });
    }

    const post = await db.post.findUnique({
      where: { id: postId },
      select: { teamId: true },
    });

    if (!post || post.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "対象の投稿が見つかりません。" }, { status: 404 });
    }

    const existingLike = await db.like.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: session.user.id,
        },
      },
    });

    if (existingLike) {
      await db.like.delete({
        where: {
          postId_userId: {
            postId,
            userId: session.user.id,
          },
        },
      });
      return NextResponse.json({
        message: "いいねを解除しました。",
        liked: false,
      });
    } else {
      const newLike = await db.like.create({
        data: {
          postId,
          userId: session.user.id,
        },
      });
      return NextResponse.json({
        message: "いいねを付けました。",
        liked: true,
        like: newLike,
      }, { status: 201 });
    }
  } catch (error: any) {
    console.error("Like toggle error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
