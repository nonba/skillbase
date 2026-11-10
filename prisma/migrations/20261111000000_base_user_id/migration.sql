-- BASE アカウントでログイン(試作・2026-11-11): HOMEBASE(土台)の User.id と結ぶ列。自動では結ばない(本人が HOMEBASE のログインを確かめたうえで結ぶ)。
ALTER TABLE "User" ADD COLUMN "baseUserId" TEXT;
CREATE UNIQUE INDEX "User_baseUserId_key" ON "User"("baseUserId");
