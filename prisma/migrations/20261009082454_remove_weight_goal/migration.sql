-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "calorieGoal" INTEGER NOT NULL DEFAULT 2000,
    "proteinGoal" INTEGER NOT NULL DEFAULT 150,
    "carbsGoal" INTEGER NOT NULL DEFAULT 250,
    "fatGoal" INTEGER NOT NULL DEFAULT 70,
    "saturatedFatGoal" INTEGER NOT NULL DEFAULT 20,
    "healthNotes" TEXT,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("calorieGoal", "carbsGoal", "fatGoal", "healthNotes", "id", "proteinGoal", "saturatedFatGoal", "userId") SELECT "calorieGoal", "carbsGoal", "fatGoal", "healthNotes", "id", "proteinGoal", "saturatedFatGoal", "userId" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE UNIQUE INDEX "Goal_userId_key" ON "Goal"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

