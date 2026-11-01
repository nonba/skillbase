import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// タイムライン投稿アンケートへの投票（1人1票・変更可）。
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    const { pollId, selectedOption } = await req.json();
    if (!pollId || !selectedOption) {
      return NextResponse.json({ error: "必要な情報が不足しています。" }, { status: 400 });
    }

    const poll = await db.postPoll.findUnique({
      where: { id: pollId },
      include: { post: { select: { teamId: true } } },
    });
    if (!poll || poll.post.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "アンケートが見つかりません。" }, { status: 404 });
    }
    const validOptions = poll.options.split(",");
    if (!validOptions.includes(selectedOption)) {
      return NextResponse.json({ error: "無効な選択肢です。" }, { status: 400 });
    }

    // 1人1票（既存があれば上書き）
    await db.postPollAnswer.upsert({
      where: { pollId_userId: { pollId, userId: session.user.id } },
      create: { pollId, userId: session.user.id, selectedOption },
      update: { selectedOption },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("post poll answer error:", e);
    return NextResponse.json({ error: "投票に失敗しました。" }, { status: 500 });
  }
}
