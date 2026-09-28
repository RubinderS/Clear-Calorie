-- CreateTable
CREATE TABLE "SavedExerciseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedExerciseItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavedExerciseItem_userId_idx" ON "SavedExerciseItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedExerciseItem_userId_name_key" ON "SavedExerciseItem"("userId", "name");
