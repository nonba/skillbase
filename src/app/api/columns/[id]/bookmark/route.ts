import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: columnId } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const existing = await db.columnBookmark.findUnique({
      where: {
        columnId_userId: {
          columnId,
          userId: session.user.id,
        },
      },
    });

    if (existing) {
      await db.columnBookmark.delete({ where: { id: existing.id } });
      return NextResponse.json({ isBookmarked: false });
    }

    await db.columnBookmark.create({
      data: {
        columnId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ isBookmarked: true });
  } catch (error: any) {
    console.error("Column bookmark toggle error:", error);
    return NextResponse.json({ error: "ブックマークの更新に失敗しました。" }, { status: 500 });
  }
}
