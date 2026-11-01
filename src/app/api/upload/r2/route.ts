import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { AwsV4Signer } from 'aws4fetch';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let env: any = {};
    try {
      const ctx = getCloudflareContext();
      if (ctx?.env) {
        env = ctx.env;
      }
    } catch (e) {
      console.warn("getCloudflareContext not available in R2 route:", e);
    }

    let publicDomain = env.R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || 'pub-039318c171d745a6852a88871952e0e5.r2.dev';
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.replace('https://', '');
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.replace('http://', '');
    if (publicDomain.endsWith('/')) publicDomain = publicDomain.slice(0, -1);

    const contentTypeHeader = request.headers.get('content-type') || '';

    // パターンA: FormData による直接ファイルアップロード
    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const teamId = (session.user as any).teamId || 'no-team';
      const userId = session.user.id || 'no-user';
      const extension = file.name.split('.').pop() || 'bin';
      const key = `teams/${teamId}/users/${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

      if (env.R2_BUCKET) {
        const arrayBuffer = await file.arrayBuffer();
        await env.R2_BUCKET.put(key, arrayBuffer, {
          httpMetadata: { contentType: file.type || 'application/octet-stream' }
        });
        // Team.storageUsedBytesをリアルタイムで加算(2026-09-02追加。以前はここが抜けており
        // アップロードしても管理画面の使用量が常に0のままだった。定期的な実測同期は
        // /api/admin/storage/syncが担う)。
        if (teamId !== 'no-team') {
          db.team.update({ where: { id: teamId }, data: { storageUsedBytes: { increment: arrayBuffer.byteLength } } }).catch((e: any) => {
            console.error('storageUsedBytes increment failed:', e);
          });
        }
        const publicUrl = `https://${publicDomain}/${key}`;
        return NextResponse.json({ uploadUrl: publicUrl, key, publicUrl });
      } else {
        return NextResponse.json({ error: 'R2_BUCKET binding is not available' }, { status: 500 });
      }
    }

    // パターンB: JSON リクエスト（Presigned URL または R2 Direct PUT URL を返却）
    const body = await request.json();
    const { filename, contentType } = body;
    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
    }

    const teamId = (session.user as any).teamId || 'no-team';
    const userId = session.user.id || 'no-user';
    const extension = filename.split('.').pop() || 'bin';
    const key = `teams/${teamId}/users/${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

    const accountId = env.R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = env.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || 'baseball-saas-strage';

    // 有効なS3クレデンシャルが存在する場合は S3 SigV4 署名付き URL を生成
    if (accountId && accessKeyId && secretAccessKey && 
        !accountId.includes('[SENSITIVE]') && !accessKeyId.includes('[SENSITIVE]') && !secretAccessKey.includes('[SENSITIVE]')) {
      const targetUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}?X-Amz-Expires=900`;
      const signer = new AwsV4Signer({
        url: targetUrl,
        method: 'PUT',
        accessKeyId,
        secretAccessKey,
        service: 's3',
        region: 'auto',
        signQuery: true,
        headers: {
          'Content-Type': contentType,
        },
      });

      const signed = await signer.sign();
      const presignedUrl = signed.url.toString();
      const publicUrl = `https://${publicDomain}/${key}`;

      return NextResponse.json({
        uploadUrl: presignedUrl,
        key,
        publicUrl,
      });
    }

    // クレデンシャル未設定・マスク時は Worker の R2_BUCKET バインディング経由の Direct PUT エンドポイントを返却
    const directUploadUrl = `/api/upload/r2?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(contentType)}`;
    const publicUrl = `https://${publicDomain}/${key}`;

    return NextResponse.json({
      uploadUrl: directUploadUrl,
      key,
      publicUrl,
    });

  } catch (error: any) {
    const errorDetails = error instanceof Error ? error.stack || error.message : String(error);
    console.error('R2 Presigned URL error:', errorDetails);
    return NextResponse.json({ error: 'Failed to generate upload URL', details: errorDetails }, { status: 500 });
  }
}

// PUT ハンドラー: R2_BUCKET バインディング経由で Worker が直接ファイルを R2 に保存
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const contentType = searchParams.get('contentType') || request.headers.get('content-type') || 'application/octet-stream';

    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    let env: any = {};
    try {
      const ctx = getCloudflareContext();
      if (ctx?.env) {
        env = ctx.env;
      }
    } catch (e) {
      console.warn("getCloudflareContext not available in PUT handler:", e);
    }

    if (!env?.R2_BUCKET) {
      return NextResponse.json({ error: 'R2_BUCKET binding is not configured' }, { status: 500 });
    }

    const arrayBuffer = await request.arrayBuffer();
    await env.R2_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType }
    });

    // "teams/<teamId>/users/<userId>/..." からteamIdを取り出してリアルタイム加算(2026-09-02追加)。
    const teamIdFromKey = key.split('/')[1];
    if (key.startsWith('teams/') && teamIdFromKey && teamIdFromKey !== 'no-team') {
      db.team.update({ where: { id: teamIdFromKey }, data: { storageUsedBytes: { increment: arrayBuffer.byteLength } } }).catch((e: any) => {
        console.error('storageUsedBytes increment failed:', e);
      });
    }

    let publicDomain = env.R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || 'pub-039318c171d745a6852a88871952e0e5.r2.dev';
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.replace('https://', '');
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.replace('http://', '');
    if (publicDomain.endsWith('/')) publicDomain = publicDomain.slice(0, -1);

    const publicUrl = `https://${publicDomain}/${key}`;
    return NextResponse.json({ success: true, key, publicUrl });
  } catch (error: any) {
    const errorDetails = error instanceof Error ? error.stack || error.message : String(error);
    console.error('R2 Direct PUT error:', errorDetails);
    return NextResponse.json({ error: 'Direct upload failed', details: errorDetails }, { status: 500 });
  }
}



