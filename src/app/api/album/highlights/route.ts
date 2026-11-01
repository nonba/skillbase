import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    if (!session.user.teamId) {
      return NextResponse.json({ error: "所属しているチームがありません。" }, { status: 404 });
    }

    // `expiresAt` が設定されているもの（ハイライト）を全件取得（過去のものも含む）
    const highlights = await db.post.findMany({
      where: {
        teamId: session.user.teamId,
        expiresAt: {
          not: null,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            jerseyNumber: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ highlights });
  } catch (error: any) {
    console.error("Highlights Fetch Error:", error);
    return NextResponse.json(
      { error: "ハイライトの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
