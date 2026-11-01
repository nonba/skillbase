import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// `next dev` でも getCloudflareContext() 経由でD1(ローカルemulation)にアクセスできるようにする。
// これが無いと db.ts の getCloudflareContext() がエラーになり、`npm run dev` でDBに触る
// APIが全て失敗する(本番はOpenNextのビルド成果物が直接workerdで動くため影響なし)。
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Prisma本体と生成クライアントをworkerdビルドに含めつつwebpackのバンドル対象から外す。
  // これによりPrismaのwasmをwebpackが解析して失敗する問題を回避する（OpenNext公式手順）。
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  experimental: {
    // webpackビルドのメモリ使用量を抑える（heap out of memory 対策）。
    webpackMemoryOptimizations: true,
  },
  async headers() {
    return [
      {
        source: "/dashboard/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
