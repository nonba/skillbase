-- 兄弟割引の方式変更(学年別金額表の丸ごと差し替え→通常金額からの定額引きに変更)。
-- DuesFeeItemはまだ0件(未使用)のためデータ移行は不要。テーブル再構築は使わず
-- DROP COLUMN/ADD COLUMNのみで対応(D1はSQLite 3.35+相当でDROP COLUMNをサポート)。
ALTER TABLE "DuesFeeItem" DROP COLUMN "siblingAmountsByGrade";
ALTER TABLE "DuesFeeItem" ADD COLUMN "siblingDiscountByRank" TEXT;
