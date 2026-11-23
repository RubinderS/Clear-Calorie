import {MeasurementCard} from '@/components/measurement-card';
import type {TrackedMetric} from '@/lib/body-metrics';

interface WeightLogProps {
  entries: {id: string; weight: number; loggedAt: Date}[];
  /** Every weigh-in from the weekly trend's range. */
  history: {value: number; loggedAt: Date}[];
  timeZone: string;
  /** Start of today in the user's timezone. */
  todayStart: Date;
  /** Active body metrics; the add dialog's manage link depends on them. */
  bodyMetrics: TrackedMetric[];
}

export function WeightLog({entries, history, timeZone, todayStart, bodyMetrics}: WeightLogProps) {
  return (
    <MeasurementCard
      title="Weight"
      unit="kg"
      entries={entries.map(({id, weight, loggedAt}) => ({
        id,
        value: weight,
        loggedAt,
      }))}
      history={history}
      timeZone={timeZone}
      todayStart={todayStart}
      formatValue={(value) => `${value} kg`}
      decimals={1}
      minSpan={10}
      deleteEndpoint="/api/weight"
      entryName="weight entry"
      emptyText="No weight entries yet."
      bodyMetrics={bodyMetrics}
      field="weight"
    />
  );
}
