-- 無料トライアル終了後、支払い方法未登録チームの督促・機能ロック用(2026-08-30追加)。
ALTER TABLE "Team" ADD COLUMN "kaihipayPaymentMethodRegisteredAt" DATETIME;
ALTER TABLE "Team" ADD COLUMN "trialPaymentReminderSentAt" DATETIME;
ALTER TABLE "Team" ADD COLUMN "trialLockedAt" DATETIME;
