/*
  Warnings:

  - Added the required column `arcanaType` to the `cards` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "glyph" TEXT NOT NULL,
    "correspondence" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "axis" TEXT NOT NULL,
    "energy" TEXT NOT NULL,
    "arcanaType" TEXT NOT NULL,
    "suit" TEXT,
    "rank" TEXT,
    "rankValue" INTEGER,
    "keywords" TEXT NOT NULL,
    "reversedKeywords" TEXT NOT NULL,
    "upright" TEXT NOT NULL,
    "reversed" TEXT NOT NULL,
    "advice" TEXT NOT NULL,
    "loveHint" TEXT,
    "workHint" TEXT,
    "moneyHint" TEXT,
    "healthHint" TEXT,
    "conceptTags" TEXT,
    "yesNo" TEXT,
    "yesNoReason" TEXT,
    "pastText" TEXT,
    "presentText" TEXT,
    "futureText" TEXT,
    "astrology" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_cards" ("advice", "axis", "correspondence", "createdAt", "element", "energy", "glyph", "healthHint", "id", "keywords", "loveHint", "moneyHint", "name", "number", "reversed", "reversedKeywords", "updatedAt", "upright", "workHint") SELECT "advice", "axis", "correspondence", "createdAt", "element", "energy", "glyph", "healthHint", "id", "keywords", "loveHint", "moneyHint", "name", "number", "reversed", "reversedKeywords", "updatedAt", "upright", "workHint" FROM "cards";
DROP TABLE "cards";
ALTER TABLE "new_cards" RENAME TO "cards";
CREATE UNIQUE INDEX "cards_number_key" ON "cards"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
