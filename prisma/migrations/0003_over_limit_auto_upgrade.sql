-- 課金対象人数がプラン上限を超えた際の自動アップグレード機能の追加(2026-08-27)。
-- 0001_init.sql以降の変更は手動ALTER TABLEの慣例に従い、このファイルは記録用
-- (実際の適用は wrangler d1 execute --remote で直接実行)。
ALTER TABLE "Team" ADD COLUMN "overLimitNotifiedAt" DATETIME;
ALTER TABLE "Team" ADD COLUMN "overLimitReminder10SentAt" DATETIME;
ALTER TABLE "Team" ADD COLUMN "overLimitReminder5SentAt" DATETIME;
ALTER TABLE "Team" ADD COLUMN "overLimitReminder3SentAt" DATETIME;
