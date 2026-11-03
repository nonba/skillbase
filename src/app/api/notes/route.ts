import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { children: { select: { id: true } } },
    });

    if (!user?.teamId) {
      return NextResponse.json({ notes: [], isCoach: false, unrepliedCount: 0 });
    }

    const isCoach =
      user.role === "MANAGER" ||
      user.isOwner ||
      user.canManagePosts ||
      user.canManageUsers;

    const childIds = (user.children || []).map((c: { id: string }) => c.id);
    const allowedAuthorIds = [user.id, ...childIds];

    const notes = await prisma.baseballNote.findMany({
      where: isCoach
        ? { teamId: user.teamId }
        : { teamId: user.teamId, authorId: { in: allowedAuthorIds } },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            isOwner: true,
            grade: true,
            jerseyNumber: true,
          },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                isOwner: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ practiceDate: "desc" }, { createdAt: "desc" }],
    });

    const formatted = notes.map((n: any) => {
      const replies = n.replies || [];
      const hasCoachReply = replies.some(
        (r: any) => r.author?.role === "MANAGER" || r.author?.isOwner
      );
      const hasCoachFeedback = Boolean(n.coachStamp) || hasCoachReply;
      const latestReply = replies.length > 0 ? replies[replies.length - 1] : null;
      return {
        ...n,
        replyCount: replies.length,
        latestReply,
        hasCoachFeedback,
      };
    });

    const unrepliedCount = isCoach
      ? formatted.filter((n: any) => !n.hasCoachFeedback).length
      : 0;

    return NextResponse.json({
      notes: formatted,
      isCoach,
      unrepliedCount,
    });
  } catch (error: any) {
    console.error("GET /api/notes error:", error);
    return NextResponse.json(
      { error: "野球ノートの取得に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user?.teamId) {
      return NextResponse.json(
        { error: "チームに所属していません。" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      practiceDate,
      activityType,
      condition,
      painNote,
      title,
      themeText,
      reviewText,
      goalText,
      videoUrl,
      imageUrl,
    } = body;

    if (!title || !String(title).trim()) {
      return NextResponse.json(
        { error: "今日のテーマ（一言タイトル）を入力してください。" },
        { status: 400 }
      );
    }

    const note = await prisma.baseballNote.create({
      data: {
        teamId: user.teamId,
        authorId: user.id,
        practiceDate:
          practiceDate || new Date().toISOString().slice(0, 10),
        activityType: activityType || "PRACTICE",
        condition: condition || "GOOD",
        painNote: condition === "PAIN" && painNote ? String(painNote).trim() : null,
        title: String(title).trim(),
        themeText: themeText ? String(themeText).trim() : "",
        reviewText: reviewText ? String(reviewText).trim() : "",
        goalText: goalText ? String(goalText).trim() : "",
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null,
      },
    });

    return NextResponse.json({ note });
  } catch (error: any) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json(
      { error: "野球ノートの提出に失敗しました。" },
      { status: 500 }
    );
  }
}
