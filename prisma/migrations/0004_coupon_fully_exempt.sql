-- 会費Pay登録自体を不要にする完全免除フラグ(審査用アカウント等)。
-- 既定はfalse=通常の割引クーポン(discountPercent=100でもベースプランのみ¥0コースに差し替えるだけ)。
ALTER TABLE Coupon ADD COLUMN fullyExempt BOOLEAN NOT NULL DEFAULT false;
