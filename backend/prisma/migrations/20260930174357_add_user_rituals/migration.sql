-- CreateTable
CREATE TABLE "user_rituals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'any',
    "source" TEXT,
    "sourceDetail" TEXT,
    "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_rituals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_rituals_userId_idx" ON "user_rituals"("userId");

-- CreateIndex
CREATE INDEX "user_rituals_userId_phase_idx" ON "user_rituals"("userId", "phase");
