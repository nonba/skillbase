-- 団費の明細(DuesFeeItem)。新規テーブル作成のみ、既存テーブルへの変更なし。
CREATE TABLE "DuesFeeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "annualMonth" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "amountsByGrade" TEXT NOT NULL,
    "hasSiblingDiscount" BOOLEAN NOT NULL DEFAULT false,
    "siblingAmountsByGrade" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DuesFeeItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
