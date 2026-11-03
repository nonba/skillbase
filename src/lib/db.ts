import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";
// `@prisma/client` の既定エントリは library(バイナリ)エンジンに解決され Workers で fs エラーになるため、
// 本番バンドルには `/wasm` のみを静的 import する。
import { PrismaClient } from "@prisma/client/wasm";
import { PrismaD1 } from "@prisma/adapter-d1";

const globalForPrisma = globalThis as unknown as {
  devPrisma?: PrismaClient;
};

const getDb = cache(() => {
  // ローカル開発時（next dev / Node.js）は wasm が未初期化になるため、
  // 動的 require で標準の @prisma/client（Node.js エンジン）を読み込みローカルSQLiteへ接続する。
  // 本番ビルド（NODE_ENV === "production"）ではこの分岐が除去され Workers バンドルに混入しない。
  if (process.env.NODE_ENV !== "production") {
    if (!globalForPrisma.devPrisma) {
      const { PrismaClient: NodePrismaClient } = eval("require")("@prisma/client");
      globalForPrisma.devPrisma = new NodePrismaClient();
    }
    return globalForPrisma.devPrisma!;
  }

  const { env } = getCloudflareContext();
  const adapter = new PrismaD1((env as any).DB);
  return new PrismaClient({ adapter });
});

// 既存の `import { db }` 呼び出しを全ファイルそのまま使えるよう Proxy で包む。
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const prisma = db;
