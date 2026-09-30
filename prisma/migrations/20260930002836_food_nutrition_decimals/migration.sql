/*
  Warnings:

  - You are about to alter the column `calories` on the `FoodLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `carbs` on the `FoodLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `fat` on the `FoodLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `protein` on the `FoodLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `saturatedFat` on the `FoodLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `calories` on the `SavedFoodItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `carbs` on the `SavedFoodItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `fat` on the `SavedFoodItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `protein` on the `SavedFoodItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - You are about to alter the column `saturatedFat` on the `SavedFoodItem` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FoodLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" REAL NOT NULL,
    "protein" REAL NOT NULL DEFAULT 0,
    "carbs" REAL NOT NULL DEFAULT 0,
    "fat" REAL NOT NULL DEFAULT 0,
    "saturatedFat" REAL NOT NULL DEFAULT 0,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FoodLog" ("calories", "carbs", "createdAt", "fat", "id", "loggedAt", "name", "protein", "saturatedFat", "updatedAt", "userId") SELECT "calories", "carbs", "createdAt", "fat", "id", "loggedAt", "name", "protein", "saturatedFat", "updatedAt", "userId" FROM "FoodLog";
DROP TABLE "FoodLog";
ALTER TABLE "new_FoodLog" RENAME TO "FoodLog";
CREATE INDEX "FoodLog_userId_loggedAt_idx" ON "FoodLog"("userId", "loggedAt");
CREATE TABLE "new_SavedFoodItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" REAL NOT NULL,
    "protein" REAL NOT NULL DEFAULT 0,
    "carbs" REAL NOT NULL DEFAULT 0,
    "fat" REAL NOT NULL DEFAULT 0,
    "saturatedFat" REAL NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedFoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedFoodItem" ("calories", "carbs", "createdAt", "fat", "id", "isPinned", "name", "protein", "saturatedFat", "updatedAt", "userId") SELECT "calories", "carbs", "createdAt", "fat", "id", "isPinned", "name", "protein", "saturatedFat", "updatedAt", "userId" FROM "SavedFoodItem";
DROP TABLE "SavedFoodItem";
ALTER TABLE "new_SavedFoodItem" RENAME TO "SavedFoodItem";
CREATE INDEX "SavedFoodItem_userId_idx" ON "SavedFoodItem"("userId");
CREATE UNIQUE INDEX "SavedFoodItem_userId_name_key" ON "SavedFoodItem"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
