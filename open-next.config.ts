// OpenNext Cloudflare アダプタ設定
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({});

// Next.js 16 は `next build` の標準バンドラが Turbopack だが、OpenNext は
// Turbopack 出力を Workers 上で読み込めず ChunkLoadError で全ページ500になる。
// Cloudflare 向けビルドだけ webpack を強制する（Vercel用の package.json "build" は不変）。
config.buildCommand = "npx prisma generate && npx next build --webpack";

export default config;
