import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const albums = await db.album.findMany({
      where: { teamId: (session.user as any).teamId },
      include: {
        _count: { select: { photos: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const team = await db.team.findUnique({
      where: { id: (session.user as any).teamId },
      select: { storageUsedBytes: true, maxStorageBytes: true, maxUsers: true }
    });

    const storageUsedBytes = team?.storageUsedBytes || 0;
    const defaultStorage = team?.maxUsers === 30 ? 3221225472 : team?.maxUsers === 70 ? 6442450944 : team?.maxUsers === 120 ? 10737418240 : 3221225472;
    const maxStorageBytes = team?.maxStorageBytes || defaultStorage;

    return NextResponse.json({ albums, storageUsedBytes, maxStorageBytes });
  } catch (error) {
    console.error("[ALBUM_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, description } = body;

    const album = await db.album.create({
      data: {
        title,
        description,
        teamId: (session.user as any).teamId
      }
    });

    return NextResponse.json({ album });
  } catch (error) {
    console.error("[ALBUM_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
