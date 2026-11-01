import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, teamId: true, lastReadTimelineAt: true }
    });

    if (!user || !user.teamId) {
      return NextResponse.json({ hasNewTimelinePosts: false });
    }

    // ユーザーの最終閲覧日時以降に、他人が投稿した件数を取得
    const newPostsCount = await db.post.count({
      where: {
        teamId: user.teamId,
        authorId: { not: user.id },
        createdAt: {
          gt: user.lastReadTimelineAt || new Date(0)
        }
      }
    });

    return NextResponse.json({
      hasNewTimelinePosts: newPostsCount > 0,
      unreadCount: newPostsCount
    });
  } catch (error: any) {
    console.error("Notifications API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // lastReadTimelineAt を現在時刻に更新
    const updatedUser = await db.user.update({
      where: { email: session.user.email },
      data: { lastReadTimelineAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Notifications API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
