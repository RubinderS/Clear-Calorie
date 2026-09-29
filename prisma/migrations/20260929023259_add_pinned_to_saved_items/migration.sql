-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SavedExerciseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedExerciseItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedExerciseItem" ("calories", "createdAt", "durationMin", "id", "name", "updatedAt", "userId") SELECT "calories", "createdAt", "durationMin", "id", "name", "updatedAt", "userId" FROM "SavedExerciseItem";
DROP TABLE "SavedExerciseItem";
ALTER TABLE "new_SavedExerciseItem" RENAME TO "SavedExerciseItem";
CREATE INDEX "SavedExerciseItem_userId_idx" ON "SavedExerciseItem"("userId");
CREATE UNIQUE INDEX "SavedExerciseItem_userId_name_key" ON "SavedExerciseItem"("userId", "name");
CREATE TABLE "new_SavedFoodItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" INTEGER NOT NULL DEFAULT 0,
    "carbs" INTEGER NOT NULL DEFAULT 0,
    "fat" INTEGER NOT NULL DEFAULT 0,
    "saturatedFat" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedFoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedFoodItem" ("calories", "carbs", "createdAt", "fat", "id", "name", "protein", "saturatedFat", "updatedAt", "userId") SELECT "calories", "carbs", "createdAt", "fat", "id", "name", "protein", "saturatedFat", "updatedAt", "userId" FROM "SavedFoodItem";
DROP TABLE "SavedFoodItem";
ALTER TABLE "new_SavedFoodItem" RENAME TO "SavedFoodItem";
CREATE INDEX "SavedFoodItem_userId_idx" ON "SavedFoodItem"("userId");
CREATE UNIQUE INDEX "SavedFoodItem_userId_name_key" ON "SavedFoodItem"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
