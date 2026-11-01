-- 入団申込み承認時に自動作成する選手アカウント(User)へのリンク用カラム。
-- 教訓(0007参照)に従い、プレーンなALTER TABLE ADD COLUMNのみ。UNIQUE制約は付けない。
ALTER TABLE "EnrollmentApplication" ADD COLUMN "createdPlayerUserId" TEXT;
