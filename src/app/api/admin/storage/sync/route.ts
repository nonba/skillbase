import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// 実際のアップロード経路(/api/upload/r2)はTeam.storageUsedBytesを一切更新しないため、
// この値は2026-09-02まで常に不正確だった(常に0近辺)。DB上のsizeBytesを集計する旧ロジックは
// そのsizeBytes自体が書き込まれていない死んだ経路に依存していたため、R2バケットの実物を
// 直接列挙して集計する方式に置き換える(2026-09-02修正)。キーの形式は
// `teams/${teamId}/users/${userId}/...`(src/app/api/upload/r2/route.ts参照)。
export async function POST(_request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (!user || !user.isSystemAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let env: any = {};
    try {
      const ctx = getCloudflareContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {
      console.warn('getCloudflareContext not available in storage sync:', e);
    }
    if (!env.R2_BUCKET) {
      return NextResponse.json({ error: 'R2_BUCKET binding is not available' }, { status: 500 });
    }

    const teamUsage = new Map<string, number>();
    const teams = await db.team.findMany({ select: { id: true } });
    for (const team of teams) teamUsage.set(team.id, 0);

    let cursor: string | undefined = undefined;
    let scannedObjects = 0;
    do {
      const listed: any = await env.R2_BUCKET.list({ prefix: 'teams/', cursor, limit: 1000 });
      for (const obj of listed.objects as any[]) {
        // "teams/<teamId>/users/<userId>/<filename>"
        const teamId = obj.key.split('/')[1];
        if (teamId && teamUsage.has(teamId)) {
          teamUsage.set(teamId, (teamUsage.get(teamId) || 0) + (obj.size || 0));
        }
        scannedObjects++;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    const updates: any[] = [];
    for (const [teamId, size] of teamUsage.entries()) {
      updates.push(db.team.update({ where: { id: teamId }, data: { storageUsedBytes: size } }));
    }
    await db.$transaction(updates);

    return NextResponse.json({
      success: true,
      message: 'Storage synchronized successfully from R2',
      teamCount: updates.length,
      scannedObjects,
    });
  } catch (error) {
    console.error('Storage sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
