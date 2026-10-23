-- AlterTable
ALTER TABLE "user_rituals" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "user_rituals" ADD COLUMN "date" TEXT;
ALTER TABLE "user_rituals" ADD COLUMN "festivalId" TEXT;
ALTER TABLE "user_rituals" ADD COLUMN "materials" TEXT;
ALTER TABLE "user_rituals" ADD COLUMN "notes" TEXT;

-- CreateTable
CREATE TABLE "user_festival_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_festival_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_rituals_userId_date_idx" ON "user_rituals"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "user_festival_notes_userId_festivalId_year_key" ON "user_festival_notes"("userId", "festivalId", "year");
