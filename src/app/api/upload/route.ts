import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // 認証チェック
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
          throw new Error('認証が必要です');
        }

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'],
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            teamId: session.user.teamId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const payload = JSON.parse(tokenPayload || "{}");
          if (payload.teamId) {
            await db.team.update({
              where: { id: payload.teamId },
              data: {
                storageUsedBytes: {
                  increment: (blob as any).size,
                },
              },
            });
            console.log(`Storage updated for team ${payload.teamId}: +${(blob as any).size} bytes`);
          }
        } catch (err) {
          console.error("Failed to update storage usage:", err);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Vercel Blob Client Upload Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 } // Webhook will retry 5 times waiting for a 200
    );
  }
}
