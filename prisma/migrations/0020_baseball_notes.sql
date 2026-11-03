-- Migration: Add BaseballNote and BaseballNoteReply
CREATE TABLE IF NOT EXISTS "BaseballNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "practiceDate" TEXT NOT NULL,
    "activityType" TEXT NOT NULL DEFAULT 'PRACTICE',
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "painNote" TEXT,
    "title" TEXT NOT NULL,
    "themeText" TEXT NOT NULL,
    "reviewText" TEXT NOT NULL,
    "goalText" TEXT NOT NULL,
    "videoUrl" TEXT,
    "imageUrl" TEXT,
    "coachStamp" TEXT,
    "stampedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BaseballNote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BaseballNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BaseballNoteReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BaseballNoteReply_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "BaseballNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BaseballNoteReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BaseballNote_teamId_createdAt_idx" ON "BaseballNote"("teamId", "createdAt");
CREATE INDEX IF NOT EXISTS "BaseballNote_authorId_createdAt_idx" ON "BaseballNote"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "BaseballNoteReply_noteId_createdAt_idx" ON "BaseballNoteReply"("noteId", "createdAt");
