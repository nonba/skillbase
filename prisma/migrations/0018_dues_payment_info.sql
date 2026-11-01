-- 団費の支払い方法・振込先(自由記述)。安全なALTER TABLE ADD COLUMNのみ。
ALTER TABLE "Team" ADD COLUMN "duesPaymentInfo" TEXT;
