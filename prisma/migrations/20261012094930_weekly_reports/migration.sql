-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastSeenAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "timeZone" TEXT;

-- CreateTable
CREATE TABLE "WeeklyReport" (
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
    "exerciseCalories" INTEGER NOT NULL,
    "weighInCount" INTEGER NOT NULL,
    "weightStart" REAL,
    "weightEnd" REAL,
    "dailyBreakdown" TEXT NOT NULL,
    "topIssues" TEXT NOT NULL,
    "strengthProgress" TEXT NOT NULL,
    "lastWeekFocusResults" TEXT,
    "nextWeekFocus" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeeklyReport_previousReportId_fkey" FOREIGN KEY ("previousReportId") REFERENCES "WeeklyReport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_previousReportId_key" ON "WeeklyReport"("previousReportId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_userId_weekStart_key" ON "WeeklyReport"("userId", "weekStart");
