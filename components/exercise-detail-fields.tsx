'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Decimal} from '@/lib/decimal';
import type {
  ExerciseDetails,
  ExerciseFields,
  ExerciseType,
} from '@/lib/exercise';

export type ExerciseDetailValues = {
  type: ExerciseType;
  durationMin: string;
  sets: string;
  reps: string;
  weight: string;
};

export const EMPTY_EXERCISE_DETAILS: ExerciseDetailValues = {
  type: 'TIME',
  durationMin: '',
  sets: '',
  reps: '',
  weight: '',
};

const TYPE_OPTIONS: {type: ExerciseType; label: string}[] = [
  {type: 'TIME', label: 'Time based'},
  {type: 'STRENGTH', label: 'Sets & reps'},
];

function toInt(value: string) {
  return new Decimal(Number(value))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
    .toNumber();
}

export function toDetailValues(
  item: Partial<Omit<ExerciseFields, 'type'>> & {type: string},
): ExerciseDetailValues {
  return {
    type: item.type === 'STRENGTH' ? 'STRENGTH' : 'TIME',
    durationMin: item.durationMin ? String(item.durationMin) : '',
    sets: item.sets != null ? String(item.sets) : '',
    reps: item.reps != null ? String(item.reps) : '',
    weight: item.weight != null ? String(item.weight) : '',
  };
}

export function toDetailsPayload(
  values: ExerciseDetailValues,
): ExerciseDetails {
  if (values.type === 'STRENGTH') {
    return {
      type: 'STRENGTH',
      sets: toInt(values.sets),
      reps: toInt(values.reps),
      weight: Number(values.weight) > 0 ? Number(values.weight) : null,
    };
  }
  return {type: 'TIME', durationMin: toInt(values.durationMin)};
}

type ExerciseDetailFieldsProps = {
  idPrefix: string;
  value: ExerciseDetailValues;
  onChange: (value: ExerciseDetailValues) => void;
};

export function ExerciseDetailFields({
  idPrefix,
  value,
  onChange,
}: ExerciseDetailFieldsProps) {
  function update(field: keyof Omit<ExerciseDetailValues, 'type'>) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({...value, [field]: event.target.value});
  }

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Exercise type"
        className="grid grid-cols-2 gap-2"
      >
        {TYPE_OPTIONS.map((option) => (
          <Button
            key={option.type}
            type="button"
            variant={value.type === option.type ? 'default' : 'outline'}
            aria-pressed={value.type === option.type}
            onClick={() => onChange({...value, type: option.type})}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {value.type === 'STRENGTH' ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor={`${idPrefix}-sets`}>Sets</Label>
            <Input
              id={`${idPrefix}-sets`}
              type="number"
              min={1}
              value={value.sets}
              onChange={update('sets')}
              required
            />
          </div>
          <div className="flex flex-col space-y-2">
            <Label htmlFor={`${idPrefix}-reps`}>Reps</Label>
            <Input
              id={`${idPrefix}-reps`}
              type="number"
              min={1}
              value={value.reps}
              onChange={update('reps')}
              required
            />
          </div>
          <div className="flex flex-col space-y-2">
            <Label htmlFor={`${idPrefix}-weight`}>Weight</Label>
            <Input
              id={`${idPrefix}-weight`}
              type="number"
              min={0}
              step="any"
              placeholder="Optional"
              value={value.weight}
              onChange={update('weight')}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col space-y-2">
          <Label htmlFor={`${idPrefix}-durationMin`}>Duration (min)</Label>
          <Input
            id={`${idPrefix}-durationMin`}
            type="number"
            min={1}
            value={value.durationMin}
            onChange={update('durationMin')}
            required
          />
        </div>
      )}
    </div>
  );
}
