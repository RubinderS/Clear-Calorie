-- CreateTable
CREATE TABLE "ExerciseSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exerciseLogId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight" REAL,
    CONSTRAINT "ExerciseSet_exerciseLogId_fkey" FOREIGN KEY ("exerciseLogId") REFERENCES "ExerciseLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseSet_exerciseLogId_position_key" ON "ExerciseSet"("exerciseLogId", "position");

-- Existing strength logs had the same reps and weight for every set.
INSERT INTO "ExerciseSet" ("id", "exerciseLogId", "position", "reps", "weight")
WITH RECURSIVE "n"("i") AS (
    SELECT 1
    UNION ALL
    SELECT "i" + 1 FROM "n"
    WHERE "i" < (SELECT MAX("sets") FROM "ExerciseLog" WHERE "type" = 'STRENGTH')
)
SELECT lower(hex(randomblob(12))), "l"."id", "n"."i", "l"."reps", "l"."weight"
FROM "ExerciseLog" "l"
JOIN "n" ON "n"."i" <= "l"."sets"
WHERE "l"."type" = 'STRENGTH' AND "l"."reps" IS NOT NULL;
