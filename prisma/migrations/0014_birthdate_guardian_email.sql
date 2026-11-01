-- 進級時の団費再計算・保護者への再通知に必要な項目。unique制約なし・プレーンな列追加のみ。
-- birthDate: 兄弟の団費割引ランク(何人目の子か)を生年月日の古い順で自動判定するために使う。
-- guardianEmail: 入団申込み・団員リスト手動追加・CSV一括登録のどの経路でも入力欄はあったが、
--   これまでUserに保存されず初回の通知メール送信時にしか使われていなかった。
ALTER TABLE "User" ADD COLUMN "birthDate" DATETIME;
ALTER TABLE "User" ADD COLUMN "guardianEmail" TEXT;
