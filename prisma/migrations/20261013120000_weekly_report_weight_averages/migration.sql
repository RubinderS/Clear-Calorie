-- Weekly reports now compare weekly weight averages instead of first and last weigh-ins.
ALTER TABLE "WeeklyReport" RENAME COLUMN "weightStart" TO "prevWeightAvg";
ALTER TABLE "WeeklyReport" RENAME COLUMN "weightEnd" TO "weightAvg";
