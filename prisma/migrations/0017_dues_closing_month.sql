-- 団費の締め月(年度末とする月、1-12)。途中入団時の「残り月数」計算の基準にする。
-- 安全なALTER TABLE ADD COLUMNのみ。既存チームは既定値3(3月)で始まる。
ALTER TABLE "Team" ADD COLUMN "duesClosingMonth" INTEGER NOT NULL DEFAULT 3;
