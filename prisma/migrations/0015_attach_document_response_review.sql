-- 申込書(AttachDocument type=APPLICATION)の回答から選手アカウントを発行できるようにするための
-- 承認フロー用カラム。旧EnrollmentApplicationの承認フローと同じ考え方(status/reviewedAt/
-- reviewedById/createdPlayerUserId)をAttachDocumentResponseに追加する。pledgeDocumentIdは
-- 申込書に同梱表示された誓約書への同意記録用。unique制約なし・プレーンな列追加のみ。
ALTER TABLE "AttachDocumentResponse" ADD COLUMN "pledgeDocumentId" TEXT;
ALTER TABLE "AttachDocumentResponse" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "AttachDocumentResponse" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "AttachDocumentResponse" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "AttachDocumentResponse" ADD COLUMN "createdPlayerUserId" TEXT;
