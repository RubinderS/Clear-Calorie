-- CreateTable
CREATE TABLE "ExercisePlanDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "plannedCount" INTEGER NOT NULL,
    CONSTRAINT "ExercisePlanDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExercisePlanDay_userId_date_key" ON "ExercisePlanDay"("userId", "date");
