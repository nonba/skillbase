-- 団員リスト(/dashboard/team-roster)用の選手プロフィール項目。unique制約なし・プレーンな列追加のみ。
ALTER TABLE "User" ADD COLUMN "nameKana" TEXT;
ALTER TABLE "User" ADD COLUMN "schoolName" TEXT;
ALTER TABLE "User" ADD COLUMN "guardianName" TEXT;
ALTER TABLE "User" ADD COLUMN "guardianRelation" TEXT;
ALTER TABLE "User" ADD COLUMN "guardianPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "homeAddress" TEXT;
ALTER TABLE "User" ADD COLUMN "healthNotes" TEXT;
