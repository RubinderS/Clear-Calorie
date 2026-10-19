import {MeasurementCard} from '@/components/measurement-card';
import type {TrackedMetric} from '@/lib/body-metrics';

interface WeightLogProps {
  entries: {id: string; weight: number; loggedAt: Date}[];
  timeZone: string;
  /** Active body metrics; the add dialog's manage link depends on them. */
  bodyMetrics: TrackedMetric[];
}

export function WeightLog({entries, timeZone, bodyMetrics}: WeightLogProps) {
  return (
    <MeasurementCard
      title="Weight"
      unit="kg"
      entries={entries.map(({id, weight, loggedAt}) => ({
        id,
        value: weight,
        loggedAt,
      }))}
      timeZone={timeZone}
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
