-- CreateTable
CREATE TABLE "NutritionEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foodName" TEXT NOT NULL,
    "brandName" TEXT,
    "servingSize" TEXT,
    "servingCount" REAL NOT NULL DEFAULT 1.0,
    "calories" REAL NOT NULL,
    "protein" REAL NOT NULL,
    "carbohydrates" REAL NOT NULL,
    "fats" REAL NOT NULL,
    "fiber" REAL,
    "sugar" REAL,
    "sourceId" TEXT,
    "tags" TEXT,
    CONSTRAINT "NutritionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NutritionEntry_userId_idx" ON "NutritionEntry"("userId");

-- CreateIndex
CREATE INDEX "NutritionEntry_timestamp_idx" ON "NutritionEntry"("timestamp");
