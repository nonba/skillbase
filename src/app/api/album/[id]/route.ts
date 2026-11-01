import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const albumId = resolvedParams.id;
    
    const album = await db.album.findUnique({
      where: { id: albumId },
      include: {
        photos: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!album || album.teamId !== session.user.teamId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // チームのストレージ使用量も一緒に返す
    const team = await db.team.findUnique({
      where: { id: album.teamId },
      select: { storageUsedBytes: true }
    });

    return NextResponse.json({ album, storageUsedBytes: team?.storageUsedBytes || 0 });
  } catch (error) {
    console.error("[ALBUM_ID_GET]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const albumId = resolvedParams.id;
    const body = await req.json();
    const { url, sizeBytes } = body;
    
    const album = await db.album.findUnique({ where: { id: albumId } });
    if (!album || album.teamId !== session.user.teamId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (typeof url !== "string" || !/^https:\/\//.test(url)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    const safeSize = Number.isFinite(Number(sizeBytes)) && Number(sizeBytes) > 0 ? Math.floor(Number(sizeBytes)) : 0;

    const photo = await db.photo.create({
      data: {
        albumId,
        url,
        sizeBytes: safeSize,
        uploadedById: session.user.id
      }
    });

    // チームの使用容量を加算
    await db.team.update({
      where: { id: album.teamId },
      data: {
        storageUsedBytes: {
          increment: safeSize
        }
      }
    });

    return NextResponse.json({ photo });
  } catch (error) {
    console.error("[ALBUM_ID_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
