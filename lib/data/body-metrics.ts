import {db} from '@/lib/db';
import {direction, inRange, where, type DateRange, type SortOrder} from './common';
import {toPlain, toPlainAll} from './plain';
import type {BodyMetric, BodyMetricLog} from './types';

// Metrics show in the order the user added them.
const METRIC_ORDER = {sortOrder: 1, createdAt: 1} as const;

export type BodyMetricFields = Pick<
  BodyMetric,
  'key' | 'label' | 'unit' | 'direction' | 'decimals' | 'sortOrder'
>;

export type BodyMetricWithLogs = BodyMetric & {logs: BodyMetricLog[]};

export async function listBodyMetrics(
  userId: string,
  {activeOnly = false}: {activeOnly?: boolean} = {},
): Promise<BodyMetric[]> {
  const {BodyMetric} = await db();
  const docs = await BodyMetric.find(
    where({userId, archivedAt: activeOnly ? null : undefined}),
  )
    .sort(METRIC_ORDER)
    .lean();
  return toPlainAll(BodyMetric, docs);
}

/** Metrics with their logs, filtered and capped per metric. */
export async function listBodyMetricsWithLogs(
  userId: string,
  {
    activeOnly = false,
    loggedAt,
    order = 'desc',
    takeEach,
  }: {activeOnly?: boolean; loggedAt?: DateRange; order?: SortOrder; takeEach?: number},
): Promise<BodyMetricWithLogs[]> {
  const {BodyMetricLog} = await db();
  const metrics = await listBodyMetrics(userId, {activeOnly});
  // A user tracks a handful of metrics, so one query each is cheap.
  return Promise.all(
    metrics.map(async (metric) => {
      const logs = await BodyMetricLog.find(
        where({metricId: metric.id, loggedAt: inRange(loggedAt)}),
      )
        .sort({loggedAt: direction(order)})
        .limit(takeEach ?? 0)
        .lean();
      return {...metric, logs: toPlainAll(BodyMetricLog, logs)};
    }),
  );
}

/** How many logs each metric has, by metric id; metrics without logs are left out. */
export async function countLogsByMetric(
  metricIds: readonly string[],
): Promise<Map<string, number>> {
  const {BodyMetricLog} = await db();
  const groups = await BodyMetricLog.aggregate<{_id: string; count: number}>([
    {$match: {metricId: {$in: [...metricIds]}}},
    {$group: {_id: '$metricId', count: {$sum: 1}}},
  ]);
  return new Map(groups.map((group) => [group._id, group.count]));
}

export async function countActiveBodyMetrics(userId: string) {
  const {BodyMetric} = await db();
  return BodyMetric.countDocuments({userId, archivedAt: null});
}

export async function findBodyMetric(userId: string, id: string): Promise<BodyMetric | null> {
  const {BodyMetric} = await db();
  const doc = await BodyMetric.findOne({_id: id, userId}).lean();
  return doc && toPlain(BodyMetric, doc);
}

export async function findBodyMetrics(
  userId: string,
  ids: readonly string[],
): Promise<BodyMetric[]> {
  const {BodyMetric} = await db();
  const docs = await BodyMetric.find({userId, _id: {$in: [...ids]}}).lean();
  return toPlainAll(BodyMetric, docs);
}

export async function createBodyMetric(
  userId: string,
  data: BodyMetricFields,
): Promise<BodyMetric> {
  const {BodyMetric} = await db();
  const doc = await BodyMetric.create({...data, userId});
  return toPlain(BodyMetric, doc.toObject());
}

export async function setBodyMetricArchived(
  id: string,
  archived: boolean,
): Promise<BodyMetric> {
  const {BodyMetric} = await db();
  const doc = await BodyMetric.findByIdAndUpdate(
    id,
    {$set: {archivedAt: archived ? new Date() : null}},
    {returnDocument: 'after'},
  )
    .orFail()
    .lean();
  return toPlain(BodyMetric, doc);
}

/**
 * Restores an archived metric in `unit`. With `convert`, every logged value
 * is rewritten from the old unit first.
 */
export async function restoreBodyMetric(
  id: string,
  unit: string,
  convert?: (value: number) => number,
): Promise<BodyMetric> {
  const {BodyMetric, BodyMetricLog} = await db();
  if (convert) {
    const logs = await BodyMetricLog.find({metricId: id}, {value: 1}).lean();
    if (logs.length > 0) {
      await BodyMetricLog.bulkWrite(
        logs.map((log) => ({
          updateOne: {filter: {_id: log._id}, update: {$set: {value: convert(log.value)}}},
        })),
      );
    }
  }
  const doc = await BodyMetric.findByIdAndUpdate(
    id,
    {$set: {archivedAt: null, unit}},
    {returnDocument: 'after'},
  )
    .orFail()
    .lean();
  return toPlain(BodyMetric, doc);
}

/** Deletes a metric and all its logs. */
export async function deleteBodyMetric(id: string) {
  const {BodyMetric, BodyMetricLog} = await db();
  await BodyMetricLog.deleteMany({metricId: id});
  await BodyMetric.deleteOne({_id: id});
}

/** Logs values at the same time; the metrics must already be checked. */
export async function createBodyMetricLogs(
  entries: readonly {metricId: string; value: number}[],
  loggedAt: Date,
): Promise<BodyMetricLog[]> {
  const {BodyMetricLog} = await db();
  const docs = await BodyMetricLog.insertMany(
    entries.map(({metricId, value}) => ({metricId, value, loggedAt})),
  );
  return docs.map((doc) => toPlain(BodyMetricLog, doc.toObject()));
}

/** False when the log doesn't exist or its metric belongs to someone else. */
export async function deleteBodyMetricLog(userId: string, id: string) {
  const {BodyMetric, BodyMetricLog} = await db();
  const log = await BodyMetricLog.findById(id, {metricId: 1}).lean();
  if (!log || !(await BodyMetric.exists({_id: log.metricId, userId}))) return false;
  const result = await BodyMetricLog.deleteOne({_id: id});
  return result.deletedCount > 0;
}

/** The latest value logged for a metric, optionally only those in `loggedAt`. */
export async function findLatestBodyMetricLog(
  metricId: string,
  loggedAt?: DateRange,
): Promise<BodyMetricLog | null> {
  const {BodyMetricLog} = await db();
  const doc = await BodyMetricLog.findOne(where({metricId, loggedAt: inRange(loggedAt)}))
    .sort({loggedAt: -1})
    .lean();
  return doc && toPlain(BodyMetricLog, doc);
}

/** The latest body fat percentage the user logged, archived metric included. */
export async function findLatestBodyFat(userId: string): Promise<number | null> {
  const {BodyMetric, BodyMetricLog} = await db();
  const metrics = await BodyMetric.find({userId, key: 'body_fat', unit: '%'}, {_id: 1}).lean();
  if (metrics.length === 0) return null;
  const log = await BodyMetricLog.findOne({metricId: {$in: metrics.map((metric) => metric._id)}})
    .sort({loggedAt: -1})
    .lean();
  return log?.value ?? null;
}
