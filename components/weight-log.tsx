import {MeasurementCard} from '@/components/measurement-card';

interface WeightLogProps {
  entries: {id: string; weight: number; loggedAt: Date}[];
  timeZone: string;
}

export function WeightLog({entries, timeZone}: WeightLogProps) {
  return (
    <MeasurementCard
      title="Weight"
      entries={entries.map(({id, weight, loggedAt}) => ({
        id,
        value: weight,
        loggedAt,
      }))}
      timeZone={timeZone}
      formatValue={String}
      minSpan={10}
      deleteEndpoint="/api/weight"
      entryName="weight entry"
      emptyText="No weight entries yet."
    />
  );
}
