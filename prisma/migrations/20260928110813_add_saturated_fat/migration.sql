-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FoodLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" INTEGER NOT NULL DEFAULT 0,
    "carbs" INTEGER NOT NULL DEFAULT 0,
    "fat" INTEGER NOT NULL DEFAULT 0,
    "saturatedFat" INTEGER NOT NULL DEFAULT 0,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FoodLog" ("calories", "carbs", "createdAt", "fat", "id", "loggedAt", "name", "protein", "updatedAt", "userId") SELECT "calories", "carbs", "createdAt", "fat", "id", "loggedAt", "name", "protein", "updatedAt", "userId" FROM "FoodLog";
DROP TABLE "FoodLog";
ALTER TABLE "new_FoodLog" RENAME TO "FoodLog";
CREATE INDEX "FoodLog_userId_loggedAt_idx" ON "FoodLog"("userId", "loggedAt");
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "calorieGoal" INTEGER NOT NULL DEFAULT 2000,
    "proteinGoal" INTEGER NOT NULL DEFAULT 150,
    "carbsGoal" INTEGER NOT NULL DEFAULT 250,
    "fatGoal" INTEGER NOT NULL DEFAULT 70,
    "saturatedFatGoal" INTEGER NOT NULL DEFAULT 20,
    "weightGoal" REAL,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("calorieGoal", "carbsGoal", "fatGoal", "id", "proteinGoal", "userId", "weightGoal") SELECT "calorieGoal", "carbsGoal", "fatGoal", "id", "proteinGoal", "userId", "weightGoal" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE UNIQUE INDEX "Goal_userId_key" ON "Goal"("userId");
CREATE TABLE "new_SavedFoodItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" INTEGER NOT NULL DEFAULT 0,
    "carbs" INTEGER NOT NULL DEFAULT 0,
    "fat" INTEGER NOT NULL DEFAULT 0,
    "saturatedFat" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedFoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedFoodItem" ("calories", "carbs", "createdAt", "fat", "id", "name", "protein", "updatedAt", "userId") SELECT "calories", "carbs", "createdAt", "fat", "id", "name", "protein", "updatedAt", "userId" FROM "SavedFoodItem";
DROP TABLE "SavedFoodItem";
ALTER TABLE "new_SavedFoodItem" RENAME TO "SavedFoodItem";
CREATE INDEX "SavedFoodItem_userId_idx" ON "SavedFoodItem"("userId");
CREATE UNIQUE INDEX "SavedFoodItem_userId_name_key" ON "SavedFoodItem"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
