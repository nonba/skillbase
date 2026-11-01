import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// R2バケットの実際のキー構造を調査するための一時的な診断エンドポイント(2026-09-02追加)。
// ?prefix= で絞り込み可能(未指定なら先頭200件)。ストレージ集計(storage/sync)が特定チームを
// 正しく拾えていない場合に、実際のキー命名パターンを確認する用途。
export async function GET(req: Request) {
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
      console.warn('getCloudflareContext not available:', e);
    }
    if (!env.R2_BUCKET) {
      return NextResponse.json({ error: 'R2_BUCKET binding is not available' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const prefix = searchParams.get('prefix') || undefined;

    const listed: any = await env.R2_BUCKET.list({ prefix, limit: 200 });
    const objects = (listed.objects as any[]).map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded }));

    return NextResponse.json({ prefix: prefix || null, count: objects.length, truncated: listed.truncated, objects });
  } catch (error: any) {
    console.error('Storage debug error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
  }
}
