import {db} from '@/lib/db';
import {toPlain} from './plain';
import type {WeeklyReport} from './types';

export type ReportWeek = Pick<WeeklyReport, 'weekStart' | 'weekEnd'>;

/** The weeks the user has reports for, newest first. */
export async function listReportWeeks(userId: string, take?: number): Promise<ReportWeek[]> {
  const {WeeklyReport} = await db();
  const docs = await WeeklyReport.find({userId}, {_id: 0, weekStart: 1, weekEnd: 1})
    .sort({weekStart: -1})
    .limit(take ?? 0)
    .lean();
  return docs.map(({weekStart, weekEnd}) => ({weekStart, weekEnd}));
}

export async function findWeeklyReport(
  userId: string,
  weekStart: string,
): Promise<WeeklyReport | null> {
  const {WeeklyReport} = await db();
  const doc = await WeeklyReport.findOne({userId, weekStart}).lean();
  return doc && toPlain(WeeklyReport, doc);
}

/** The latest report before the given week. */
export async function findPreviousWeeklyReport(
  userId: string,
  weekStart: string,
): Promise<WeeklyReport | null> {
  const {WeeklyReport} = await db();
  const doc = await WeeklyReport.findOne({userId, weekStart: {$lt: weekStart}})
    .sort({weekStart: -1})
    .lean();
  return doc && toPlain(WeeklyReport, doc);
}

/** The newest report the user hasn't opened. */
export async function findLatestUnseenReportWeek(userId: string): Promise<ReportWeek | null> {
  const {WeeklyReport} = await db();
  const doc = await WeeklyReport.findOne({userId, seenAt: null}, {weekStart: 1, weekEnd: 1})
    .sort({weekStart: -1})
    .lean();
  return doc && {weekStart: doc.weekStart, weekEnd: doc.weekEnd};
}

/** Marks every unseen report up to and including the given week as seen. */
export async function markWeeklyReportsSeen(userId: string, upToWeekStart: string) {
  const {WeeklyReport} = await db();
  await WeeklyReport.updateMany(
    {userId, seenAt: null, weekStart: {$lte: upToWeekStart}},
    {$set: {seenAt: new Date()}},
  );
}

/** Throws a unique violation when the week already has a report. */
export async function createWeeklyReport(
  data: Omit<WeeklyReport, 'id' | 'seenAt' | 'createdAt' | 'updatedAt'>,
) {
  const {WeeklyReport} = await db();
  await WeeklyReport.create(data);
}
