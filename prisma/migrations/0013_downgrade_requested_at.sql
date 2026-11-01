-- FULL→FREE_ENTRYへの自己ダウングレード時、会費Payのコース解約を次回請求締切後まで
-- 遅延させるためのフラグ(2026-09-03)。プレーンなALTER TABLE ADD COLUMNのみ。
ALTER TABLE "Team" ADD COLUMN "downgradeRequestedAt" DATETIME;
