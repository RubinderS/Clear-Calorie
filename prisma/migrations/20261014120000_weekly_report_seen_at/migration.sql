-- Tracks whether the user has opened a weekly report, for the dashboard notice.
ALTER TABLE "WeeklyReport" ADD COLUMN "seenAt" DATETIME;
