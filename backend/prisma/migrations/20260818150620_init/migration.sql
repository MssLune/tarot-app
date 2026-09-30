-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "glyph" TEXT NOT NULL,
    "correspondence" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "axis" TEXT NOT NULL,
    "energy" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "reversedKeywords" TEXT NOT NULL,
    "upright" TEXT NOT NULL,
    "reversed" TEXT NOT NULL,
    "advice" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "spreads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "preset" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "spread_positions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spreadId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "rotate" REAL,
    CONSTRAINT "spread_positions_spreadId_fkey" FOREIGN KEY ("spreadId") REFERENCES "spreads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "cards_number_key" ON "cards"("number");

-- CreateIndex
CREATE INDEX "spread_positions_spreadId_idx" ON "spread_positions"("spreadId");
