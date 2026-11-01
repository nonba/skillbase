-- オーナー(監督・代表者)自己登録のメールアドレスが実在するか、これまで確認していなかった。
-- トークンを発行してメール送信し、リンクを踏むまでログインをブロックする(Connect Suiteと同じ設計)。
-- ロステージから作る選手/保護者アカウントはトークンを発行しないため、この列はNULLのまま=対象外。
ALTER TABLE User ADD COLUMN emailVerifiedAt DATETIME;
ALTER TABLE User ADD COLUMN emailVerificationToken TEXT;
