-- AlterTable
ALTER TABLE "ExerciseGoal" ADD COLUMN "setPlan" TEXT;

-- AlterTable
ALTER TABLE "SavedExerciseItem" ADD COLUMN "setPlan" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExerciseSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exerciseLogId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reps" INTEGER,
    "durationSec" INTEGER,
    "weight" REAL,
    CONSTRAINT "ExerciseSet_exerciseLogId_fkey" FOREIGN KEY ("exerciseLogId") REFERENCES "ExerciseLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExerciseSet" ("exerciseLogId", "id", "position", "reps", "weight") SELECT "exerciseLogId", "id", "position", "reps", "weight" FROM "ExerciseSet";
DROP TABLE "ExerciseSet";
ALTER TABLE "new_ExerciseSet" RENAME TO "ExerciseSet";
CREATE UNIQUE INDEX "ExerciseSet_exerciseLogId_position_key" ON "ExerciseSet"("exerciseLogId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

