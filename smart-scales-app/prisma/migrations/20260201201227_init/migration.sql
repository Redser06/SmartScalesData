-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL,
    "weight" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "bmi" REAL,
    "bodyFatPercentage" REAL,
    "muscleMass" REAL,
    "visceralFat" REAL,
    "bodyWaterPercentage" REAL,
    "boneMass" REAL,
    "bmr" REAL,
    "bodyType" TEXT,
    "bodyScore" REAL,
    "proteinRate" REAL,
    "skeletalMuscleRate" REAL,
    "subcutaneousFat" REAL,
    "leanBodyMass" REAL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'old_scale',
    "rawData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WeightEntry_timestamp_key" ON "WeightEntry"("timestamp");
