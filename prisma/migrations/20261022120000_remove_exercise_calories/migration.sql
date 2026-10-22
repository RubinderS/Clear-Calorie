-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExerciseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TIME',
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "sets" INTEGER,
    "reps" INTEGER,
    "weight" REAL,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exerciseGoalId" TEXT,
    "goalDate" TEXT,
    "catalogId" TEXT,
    CONSTRAINT "ExerciseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseLog_exerciseGoalId_fkey" FOREIGN KEY ("exerciseGoalId") REFERENCES "ExerciseGoal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExerciseLog" ("catalogId", "createdAt", "durationMin", "exerciseGoalId", "goalDate", "id", "loggedAt", "name", "reps", "sets", "type", "updatedAt", "userId", "weight") SELECT "catalogId", "createdAt", "durationMin", "exerciseGoalId", "goalDate", "id", "loggedAt", "name", "reps", "sets", "type", "updatedAt", "userId", "weight" FROM "ExerciseLog";
DROP TABLE "ExerciseLog";
ALTER TABLE "new_ExerciseLog" RENAME TO "ExerciseLog";
CREATE INDEX "ExerciseLog_userId_loggedAt_idx" ON "ExerciseLog"("userId", "loggedAt");
CREATE UNIQUE INDEX "ExerciseLog_exerciseGoalId_goalDate_key" ON "ExerciseLog"("exerciseGoalId", "goalDate");
CREATE TABLE "new_SavedExerciseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TIME',
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "sets" INTEGER,
    "reps" INTEGER,
    "weight" REAL,
    "setPlan" TEXT,
    "catalogId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedExerciseItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedExerciseItem" ("catalogId", "createdAt", "durationMin", "id", "isPinned", "name", "reps", "setPlan", "sets", "type", "updatedAt", "userId", "weight") SELECT "catalogId", "createdAt", "durationMin", "id", "isPinned", "name", "reps", "setPlan", "sets", "type", "updatedAt", "userId", "weight" FROM "SavedExerciseItem";
DROP TABLE "SavedExerciseItem";
ALTER TABLE "new_SavedExerciseItem" RENAME TO "SavedExerciseItem";
CREATE INDEX "SavedExerciseItem_userId_idx" ON "SavedExerciseItem"("userId");
CREATE UNIQUE INDEX "SavedExerciseItem_userId_name_key" ON "SavedExerciseItem"("userId", "name");
CREATE TABLE "new_ExerciseGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TIME',
    "durationMin" INTEGER,
    "sets" INTEGER,
    "reps" INTEGER,
    "weight" REAL,
    "setPlan" TEXT,
    "tempoMs" INTEGER,
    "notes" TEXT,
    "catalogId" TEXT,
    "steps" TEXT,
    "daysMask" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExerciseGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExerciseGoal" ("catalogId", "createdAt", "daysMask", "durationMin", "id", "name", "notes", "reps", "setPlan", "sets", "steps", "tempoMs", "type", "updatedAt", "userId", "weight") SELECT "catalogId", "createdAt", "daysMask", "durationMin", "id", "name", "notes", "reps", "setPlan", "sets", "steps", "tempoMs", "type", "updatedAt", "userId", "weight" FROM "ExerciseGoal";
DROP TABLE "ExerciseGoal";
ALTER TABLE "new_ExerciseGoal" RENAME TO "ExerciseGoal";
CREATE INDEX "ExerciseGoal_userId_idx" ON "ExerciseGoal"("userId");
CREATE TABLE "new_WeeklyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "previousReportId" TEXT,
    "calorieGoal" INTEGER NOT NULL,
    "proteinGoal" INTEGER NOT NULL,
    "carbsGoal" INTEGER NOT NULL,
    "fatGoal" INTEGER NOT NULL,
    "saturatedFatGoal" INTEGER NOT NULL,
    "healthNotes" TEXT,
    "daysLogged" INTEGER NOT NULL,
    "avgCalories" REAL NOT NULL,
    "avgProtein" REAL NOT NULL,
    "avgCarbs" REAL NOT NULL,
    "avgFat" REAL NOT NULL,
    "avgSaturatedFat" REAL NOT NULL,
    "calorieDaysOver" INTEGER NOT NULL,
    "proteinDaysHit" INTEGER NOT NULL,
    "satFatDaysOver" INTEGER NOT NULL,
    "healthAlertCount" INTEGER NOT NULL,
    "exercisesPlanned" INTEGER NOT NULL,
    "exercisesDone" INTEGER NOT NULL,
    "cardioMinutes" INTEGER NOT NULL,
    "strengthSessions" INTEGER NOT NULL,
    "weighInCount" INTEGER NOT NULL,
    "weightAvg" REAL,
    "prevWeightAvg" REAL,
    "bodyMetrics" TEXT,
    "profile" TEXT,
    "dailyBreakdown" TEXT NOT NULL,
    "topIssues" TEXT NOT NULL,
    "strengthProgress" TEXT NOT NULL,
    "lastWeekFocusResults" TEXT,
    "nextWeekFocus" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "goalSuggestions" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "seenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeeklyReport_previousReportId_fkey" FOREIGN KEY ("previousReportId") REFERENCES "WeeklyReport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WeeklyReport" ("avgCalories", "avgCarbs", "avgFat", "avgProtein", "avgSaturatedFat", "bodyMetrics", "calorieDaysOver", "calorieGoal", "carbsGoal", "cardioMinutes", "createdAt", "dailyBreakdown", "daysLogged", "exercisesDone", "exercisesPlanned", "fatGoal", "goalSuggestions", "headline", "healthAlertCount", "healthNotes", "id", "lastWeekFocusResults", "model", "narrative", "nextWeekFocus", "prevWeightAvg", "previousReportId", "profile", "promptVersion", "proteinDaysHit", "proteinGoal", "satFatDaysOver", "saturatedFatGoal", "seenAt", "strengthProgress", "strengthSessions", "timeZone", "topIssues", "updatedAt", "userId", "weekEnd", "weekStart", "weighInCount", "weightAvg") SELECT "avgCalories", "avgCarbs", "avgFat", "avgProtein", "avgSaturatedFat", "bodyMetrics", "calorieDaysOver", "calorieGoal", "carbsGoal", "cardioMinutes", "createdAt", "dailyBreakdown", "daysLogged", "exercisesDone", "exercisesPlanned", "fatGoal", "goalSuggestions", "headline", "healthAlertCount", "healthNotes", "id", "lastWeekFocusResults", "model", "narrative", "nextWeekFocus", "prevWeightAvg", "previousReportId", "profile", "promptVersion", "proteinDaysHit", "proteinGoal", "satFatDaysOver", "saturatedFatGoal", "seenAt", "strengthProgress", "strengthSessions", "timeZone", "topIssues", "updatedAt", "userId", "weekEnd", "weekStart", "weighInCount", "weightAvg" FROM "WeeklyReport";
DROP TABLE "WeeklyReport";
ALTER TABLE "new_WeeklyReport" RENAME TO "WeeklyReport";
CREATE UNIQUE INDEX "WeeklyReport_previousReportId_key" ON "WeeklyReport"("previousReportId");
CREATE UNIQUE INDEX "WeeklyReport_userId_weekStart_key" ON "WeeklyReport"("userId", "weekStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

