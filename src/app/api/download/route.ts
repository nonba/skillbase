import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// ダウンロードを許可するホスト（自チームのR2公開バケットのみ。SSRF対策）
const ALLOWED_HOSTS = new Set([
  "pub-039318c171d745a6852a88871952e0e5.r2.dev",
]);

// R2上のメディアを「添付ファイルとして保存」ヘッダ付きで中継する。
// 直接R2のURLを開くとブラウザ内で表示されてしまい保存にならないため、
// このプロキシ経由で Content-Disposition: attachment を付けて返す。
// （CORSの問題も、Android WebViewのダウンロード制約もこれで回避できる）
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const url = new URL(req.url);
    const target = url.searchParams.get("u");
    const name = url.searchParams.get("name") || "download";

    if (!target) {
      return NextResponse.json({ error: "URLが指定されていません。" }, { status: 400 });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return NextResponse.json({ error: "不正なURLです。" }, { status: 400 });
    }

    if (targetUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return NextResponse.json({ error: "許可されていないダウンロード元です。" }, { status: 403 });
    }

    const upstream = await fetch(targetUrl.toString());
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "ファイルの取得に失敗しました。" }, { status: 502 });
    }

    // ファイル名はASCII安全な形に整形（日本語等はfilename*で対応）
    const safeName = name.replace(/[^\w.\-]/g, "_");
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/octet-stream");
    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) headers.set("Content-Length", contentLength);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(name)}`
    );
    headers.set("Cache-Control", "private, max-age=0");

    return new Response(upstream.body, { status: 200, headers });
  } catch (error: any) {
    console.error("Download proxy error:", error);
    return NextResponse.json({ error: "ダウンロードに失敗しました。" }, { status: 500 });
  }
}
