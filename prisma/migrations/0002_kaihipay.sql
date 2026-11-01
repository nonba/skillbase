-- 会費Pay決済連携の追加(2026-08-26)。0001_init.sql以降の変更は手動ALTER TABLEの慣例に従い、
-- このファイルは記録用(実際の適用は wrangler d1 execute --remote で直接実行)。
ALTER TABLE "Team" ADD COLUMN "kaihipayCustomerNumber" TEXT;

CREATE TABLE "KaihipayConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiToken" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
