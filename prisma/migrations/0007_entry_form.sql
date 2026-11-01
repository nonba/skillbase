-- 入団申込みフォーム機能の追加(2026-09-01構想・2026-09-02にALTER TABLE方式で安全に再実装)。
-- entrySlugにDBレベルのUNIQUE制約は付けない。SQLiteでUNIQUE列の追加はテーブル再構築(CREATE→INSERT→DROP→RENAME)
-- を要求し、外部キー連鎖削除で本番データが消える事故を2026-09-01に起こしたため。一意性は
-- src/app/api/team/entry-settings/route.ts のアプリ層チェックで担保する。
ALTER TABLE "Team" ADD COLUMN "entrySlug" TEXT;
ALTER TABLE "Team" ADD COLUMN "entryEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ADD COLUMN "entryGuideText" TEXT;
ALTER TABLE "Team" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'FULL';

CREATE TABLE "EnrollmentApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "playerName" TEXT NOT NULL,
    "playerNameKana" TEXT,
    "birthDate" DATETIME,
    "schoolName" TEXT,
    "grade" INTEGER,
    "experienceYears" TEXT,
    "desiredJoinDate" DATETIME,
    "healthNotes" TEXT,
    "guardianName" TEXT NOT NULL,
    "guardianRelation" TEXT,
    "guardianPhone" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EnrollmentApplication_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
