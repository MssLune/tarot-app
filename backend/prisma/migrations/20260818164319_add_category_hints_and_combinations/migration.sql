-- AlterTable
ALTER TABLE "cards" ADD COLUMN "healthHint" TEXT;
ALTER TABLE "cards" ADD COLUMN "loveHint" TEXT;
ALTER TABLE "cards" ADD COLUMN "moneyHint" TEXT;
ALTER TABLE "cards" ADD COLUMN "workHint" TEXT;

-- CreateTable
CREATE TABLE "card_combinations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cardIds" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'rose',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
