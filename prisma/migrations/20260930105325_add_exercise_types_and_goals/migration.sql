-- CreateTable
CREATE TABLE "ExerciseGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TIME',
    "calories" INTEGER NOT NULL DEFAULT 0,
    "durationMin" INTEGER,
    "sets" INTEGER,
    "reps" INTEGER,
    "weight" REAL,
    "daysMask" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExerciseGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExerciseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TIME',
    "calories" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "sets" INTEGER,
    "reps" INTEGER,
    "weight" REAL,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exerciseGoalId" TEXT,
    "goalDate" TEXT,
    CONSTRAINT "ExerciseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseLog_exerciseGoalId_fkey" FOREIGN KEY ("exerciseGoalId") REFERENCES "ExerciseGoal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExerciseLog" ("calories", "createdAt", "durationMin", "id", "loggedAt", "name", "updatedAt", "userId") SELECT "calories", "createdAt", "durationMin", "id", "loggedAt", "name", "updatedAt", "userId" FROM "ExerciseLog";
DROP TABLE "ExerciseLog";
ALTER TABLE "new_ExerciseLog" RENAME TO "ExerciseLog";
CREATE INDEX "ExerciseLog_userId_loggedAt_idx" ON "ExerciseLog"("userId", "loggedAt");
CREATE UNIQUE INDEX "ExerciseLog_exerciseGoalId_goalDate_key" ON "ExerciseLog"("exerciseGoalId", "goalDate");
CREATE TABLE "new_SavedExerciseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TIME',
    "calories" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "sets" INTEGER,
    "reps" INTEGER,
    "weight" REAL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedExerciseItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedExerciseItem" ("calories", "createdAt", "durationMin", "id", "isPinned", "name", "updatedAt", "userId") SELECT "calories", "createdAt", "durationMin", "id", "isPinned", "name", "updatedAt", "userId" FROM "SavedExerciseItem";
DROP TABLE "SavedExerciseItem";
ALTER TABLE "new_SavedExerciseItem" RENAME TO "SavedExerciseItem";
CREATE INDEX "SavedExerciseItem_userId_idx" ON "SavedExerciseItem"("userId");
CREATE UNIQUE INDEX "SavedExerciseItem_userId_name_key" ON "SavedExerciseItem"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExerciseGoal_userId_idx" ON "ExerciseGoal"("userId");

