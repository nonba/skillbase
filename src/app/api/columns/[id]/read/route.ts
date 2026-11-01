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

    const body = await req.json().catch(() => ({}));
    const toggle = Boolean(body?.toggle);

    const existing = await db.columnRead.findUnique({
      where: {
        columnId_userId: {
          columnId,
          userId: session.user.id,
        },
      },
    });

    if (existing) {
      if (toggle) {
        await db.columnRead.delete({ where: { id: existing.id } });
        return NextResponse.json({ isRead: false });
      }
      return NextResponse.json({ isRead: true });
    }

    await db.columnRead.create({
      data: {
        columnId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ isRead: true });
  } catch (error: any) {
    console.error("Column read toggle error:", error);
    return NextResponse.json({ error: "処理に失敗しました。" }, { status: 500 });
  }
}
