-- Deduplicate existing WeightEntry rows by (COALESCE(userId, '__anon__'), timestamp), keeping MIN(id)
DELETE FROM "WeightEntry"
WHERE "id" NOT IN (
    SELECT MIN("id")
    FROM "WeightEntry"
    GROUP BY COALESCE("userId", '__anon__'), "timestamp"
);

-- AlterTable WeightEntry: add calibrated composition columns
ALTER TABLE "WeightEntry" ADD COLUMN "calibratedWeightKg" REAL;
ALTER TABLE "WeightEntry" ADD COLUMN "calibratedBodyFatPct" REAL;
ALTER TABLE "WeightEntry" ADD COLUMN "calibratedMuscleMassKg" REAL;

-- CreateIndex on WeightEntry(userId, timestamp)
CREATE UNIQUE INDEX "WeightEntry_userId_timestamp_key" ON "WeightEntry"("userId", "timestamp");

-- CreateTable UserJourneyProfile
CREATE TABLE "UserJourneyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "heightCm" REAL NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "biologicalSex" TEXT NOT NULL,
    "activityLevel" TEXT NOT NULL DEFAULT 'moderate',
    "resistanceTrainingDaysWk" INTEGER NOT NULL DEFAULT 0,
    "sleepHoursAvg" REAL,
    "lifestyleNotes" TEXT,
    "goalType" TEXT NOT NULL DEFAULT 'recomposition',
    "targetWeightKg" REAL NOT NULL,
    "targetBodyFatPct" REAL,
    "targetMuscleMassKg" REAL,
    "targetDate" DATETIME,
    "preferredWeeklyRatePctBw" REAL NOT NULL DEFAULT -0.5,
    "userOverridesJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserJourneyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserJourneyProfile_userId_key" ON "UserJourneyProfile"("userId");

-- CreateTable HistoricAnchor
CREATE TABLE "HistoricAnchor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "anchorDate" DATETIME NOT NULL,
    "weightKg" REAL NOT NULL,
    "bodyFatPct" REAL,
    "muscleMassKg" REAL,
    "ageAtAnchor" INTEGER,
    "lifestyleContext" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'user',
    "citationNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricAnchor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HistoricAnchor_userId_anchorDate_idx" ON "HistoricAnchor"("userId", "anchorDate");

-- CreateTable ScaleCalibration
CREATE TABLE "ScaleCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "weightOffsetKg" REAL NOT NULL DEFAULT 0.0,
    "bodyFatOffsetPct" REAL NOT NULL DEFAULT 0.0,
    "muscleMassOffsetKg" REAL NOT NULL DEFAULT 0.0,
    "isReferenceScale" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScaleCalibration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ScaleCalibration_userId_sourceSlug_key" ON "ScaleCalibration"("userId", "sourceSlug");

-- CreateTable ScenarioProposal
CREATE TABLE "ScenarioProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvalRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScenarioProposal_userId_status_idx" ON "ScenarioProposal"("userId", "status");

-- CreateTable LlmSpendLedger
CREATE TABLE "LlmSpendLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costUsd" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LlmSpendLedger_monthKey_userId_idx" ON "LlmSpendLedger"("monthKey", "userId");
