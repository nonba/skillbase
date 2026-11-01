-- 「HOMEBASEを試す」ボタンでのトライアル開始日時。プレーンなADD COLUMNのみ、unique制約なし。
ALTER TABLE "Team" ADD COLUMN "homebaseTrialStartedAt" DATETIME;
