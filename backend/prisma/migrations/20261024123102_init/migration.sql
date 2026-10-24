-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "tier" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_rituals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'any',
    "source" TEXT,
    "sourceDetail" TEXT,
    "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT,
    "festivalId" TEXT,
    "notes" TEXT,
    "materials" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_rituals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_festival_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_festival_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
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
    "pastTextReversed" TEXT,
    "presentTextReversed" TEXT,
    "futureTextReversed" TEXT,
    "astrology" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_combinations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cardIds" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'rose',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "preset" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spreads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spread_positions" (
    "id" TEXT NOT NULL,
    "spreadId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotate" DOUBLE PRECISION,

    CONSTRAINT "spread_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_decks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allowReversed" BOOLEAN NOT NULL DEFAULT true,
    "cards" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_spreads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "preset" TEXT,
    "positions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_spreads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_readings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "question" TEXT,
    "questionCategory" TEXT,
    "system" TEXT NOT NULL,
    "spread" TEXT NOT NULL,
    "deck" TEXT,
    "cards" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "astronomy_cache" (
    "key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "astronomy_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_stripeCustomerId_idx" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "user_rituals_userId_idx" ON "user_rituals"("userId");

-- CreateIndex
CREATE INDEX "user_rituals_userId_phase_idx" ON "user_rituals"("userId", "phase");

-- CreateIndex
CREATE INDEX "user_rituals_userId_date_idx" ON "user_rituals"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "user_festival_notes_userId_festivalId_year_key" ON "user_festival_notes"("userId", "festivalId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "cards_number_key" ON "cards"("number");

-- CreateIndex
CREATE INDEX "spread_positions_spreadId_idx" ON "spread_positions"("spreadId");

-- CreateIndex
CREATE INDEX "user_decks_userId_idx" ON "user_decks"("userId");

-- CreateIndex
CREATE INDEX "user_spreads_userId_idx" ON "user_spreads"("userId");

-- CreateIndex
CREATE INDEX "user_readings_userId_idx" ON "user_readings"("userId");

-- CreateIndex
CREATE INDEX "usage_events_userId_resource_createdAt_idx" ON "usage_events"("userId", "resource", "createdAt");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_rituals" ADD CONSTRAINT "user_rituals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_festival_notes" ADD CONSTRAINT "user_festival_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spread_positions" ADD CONSTRAINT "spread_positions_spreadId_fkey" FOREIGN KEY ("spreadId") REFERENCES "spreads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_decks" ADD CONSTRAINT "user_decks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_spreads" ADD CONSTRAINT "user_spreads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_readings" ADD CONSTRAINT "user_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
