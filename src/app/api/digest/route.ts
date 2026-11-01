import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ダッシュボードの「📅 予定コメント」タブ用API。
// 各予定に付いたコメントを、探し回らずに一覧・ジャンプできるよう時系列でまとめて返す読み取り専用API。
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const teamId = (session.user as any).teamId;
    if (!teamId) {
      return NextResponse.json({ items: [] });
    }

    const eventComments = await db.eventComment.findMany({
      where: { event: { teamId } },
      include: {
        author: { select: { name: true } },
        event: { select: { id: true, title: true, startTime: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const items = eventComments.map((c) => ({
      type: "eventComment" as const,
      id: c.id,
      content: c.content,
      authorName: c.author?.name || "不明なユーザー",
      createdAt: c.createdAt,
      eventId: c.event.id,
      eventTitle: c.event.title,
      eventStartTime: c.event.startTime,
      attachmentUrl: c.attachmentUrl,
      attachmentName: c.attachmentName,
      attachmentIsImage: c.attachmentIsImage,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[DIGEST_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
