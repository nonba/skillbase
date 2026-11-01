// OpenNextの生成物(.open-next/worker.js)をラップし、Cloudflare Cronトリガー(scheduled)を追加する
// ためのエントリ(2026-08-27追加)。.open-next/worker.js はビルドのたびに再生成されるため、
// cron用のロジックはここ(リポジトリ管理下のファイル)に書く。wrangler.jsonc の main はこのファイルを指す。
//
// scheduledハンドラ自体は何のロジックも持たず、Next.js側のAPIルート(/api/cron/billing-check)を
// HTTP経由で叩くだけにしている(WorkerランタイムからNext.jsのルートハンドラを直接importして呼ぶのは
// リクエストコンテキストの再現が煩雑なため、素直にHTTP越しで完結させる)。
// .open-next/worker.js はビルド後にしか存在しない生成物のため、Next.js側のtsconfig.jsonの
// 型チェック対象からこのファイル自体を除外している(wranglerのesbuildバンドル時にのみ解決されればよい)。
import openNextWorker, { BucketCachePurge } from "./.open-next/worker.js";

export { BucketCachePurge };

export default {
  fetch: openNextWorker.fetch,
  async scheduled(_event: unknown, env: { CRON_SECRET?: string }, _ctx: unknown) {
    await fetch("https://skillbase.easystance.app/api/cron/billing-check", {
      method: "POST",
      headers: { "x-cron-secret": env.CRON_SECRET || "" },
    });
  },
};
