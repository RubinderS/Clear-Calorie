'use client';

import {Plus, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Decimal} from '@/lib/decimal';
import {
  MAX_SETS,
  summarizeSets,
  uniformSets,
  type ExerciseDetails,
  type ExerciseFields,
  type ExerciseSet,
  type ExerciseType,
} from '@/lib/exercise';
import {MAX_REPS} from '@/lib/workout';

export type ExerciseDetailValues = {
  type: ExerciseType;
  durationMin: string;
  sets: string;
  reps: string;
  weight: string;
};

export const EMPTY_EXERCISE_DETAILS: ExerciseDetailValues = {
  type: 'STRENGTH',
  durationMin: '',
  sets: '',
  reps: '',
  weight: '',
};

const TYPE_OPTIONS: {type: ExerciseType; label: string}[] = [
  {type: 'STRENGTH', label: 'Sets & reps'},
  {type: 'TIME', label: 'Time based'},
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
  lockType?: boolean;
};

export function ExerciseDetailFields({
  idPrefix,
  value,
  onChange,
  lockType = false,
}: ExerciseDetailFieldsProps) {
  function update(field: keyof Omit<ExerciseDetailValues, 'type'>) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({...value, [field]: event.target.value});
  }

  return (
    <div className="space-y-4">
      {!lockType && (
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
      )}
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
              max={MAX_REPS}
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

export type SetValues = {reps: string; weight: string};

/** A log's work: each strength set, or a duration for timed exercise. */
export type WorkValues = {durationMin: string; sets: SetValues[] | null};

export type ExerciseLogValues = WorkValues & {
  calories: string;
  /** Set once the user types calories, which then stop following the work. */
  caloriesEdited: boolean;
};

type LoggableExercise = {
  type: string;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  exerciseSets?: readonly ExerciseSet[];
};

export function toWorkValues(item: LoggableExercise): WorkValues {
  if (item.type !== 'STRENGTH') {
    return {
      durationMin: item.durationMin ? String(item.durationMin) : '',
      sets: null,
    };
  }
  const sets = item.exerciseSets?.length
    ? item.exerciseSets
    : uniformSets(item.sets ?? 1, item.reps ?? 1, item.weight);
  return {
    durationMin: '',
    sets: sets.map((set) => ({
      reps: String(set.reps),
      weight: set.weight != null ? String(set.weight) : '',
    })),
  };
}

export function toSetsPayload(sets: readonly SetValues[]): ExerciseSet[] {
  return sets.map((set) => ({
    reps: toInt(set.reps),
    weight: Number(set.weight) > 0 ? Number(set.weight) : null,
  }));
}

/** Details plus each set, as the exercise APIs take them. */
export function toLogPayload(values: ExerciseLogValues) {
  const calories = toInt(values.calories);
  if (!values.sets) {
    return {
      calories,
      type: 'TIME' as const,
      durationMin: toInt(values.durationMin),
    };
  }
  const exerciseSets = toSetsPayload(values.sets);
  return {
    calories,
    type: 'STRENGTH' as const,
    ...summarizeSets(exerciseSets),
    exerciseSets,
  };
}

/**
 * Relative amount of work. Weight counts only when every set has one, so
 * adding a weight to an unweighted log doesn't multiply its calories.
 */
function workRatio(from: WorkValues, to: WorkValues) {
  if (from.sets && to.sets) {
    const weighted = [...from.sets, ...to.sets].every(
      (set) => Number(set.weight) > 0,
    );
    const volume = (sets: SetValues[]) =>
      sets.reduce(
        (sum, set) =>
          sum + Number(set.reps) * (weighted ? Number(set.weight) : 1),
        0,
      );
    const fromVolume = volume(from.sets);
    return fromVolume > 0 ? volume(to.sets) / fromVolume : null;
  }
  const fromDuration = Number(from.durationMin);
  return fromDuration > 0 ? Number(to.durationMin) / fromDuration : null;
}

/** Scales calories burned by the change in work, or null if it can't tell. */
function scaleCalories(
  calories: number,
  from: WorkValues,
  to: WorkValues,
): number | null {
  const ratio = workRatio(from, to);
  if (ratio === null || !Number.isFinite(ratio)) return null;
  return new Decimal(calories)
    .times(ratio)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
    .toNumber();
}

/** Values for logging `work`, with calories scaled from the baseline's. */
export function initialLogValues(
  baseline: WorkValues,
  baselineCalories: number,
  work: WorkValues = baseline,
): ExerciseLogValues {
  return {
    ...work,
    calories: String(
      scaleCalories(baselineCalories, baseline, work) ?? baselineCalories,
    ),
    caloriesEdited: false,
  };
}

const SET_ROW = 'grid grid-cols-[2rem_1fr_1fr_2.25rem] items-center gap-2';

function SetListFields({
  value,
  onChange,
}: {
  value: SetValues[];
  onChange: (sets: SetValues[]) => void;
}) {
  function update(index: number, field: keyof SetValues) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(
        value.map((set, i) =>
          i === index ? {...set, [field]: event.target.value} : set,
        ),
      );
  }

  return (
    <div role="group" aria-label="Sets" className="space-y-2">
      <div className={`${SET_ROW} text-sm font-medium`} aria-hidden>
        <span>Set</span>
        <span>Reps</span>
        <span>Weight</span>
      </div>
      {value.map((set, index) => (
        <div key={index} className={SET_ROW}>
          <span className="text-sm tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <Input
            type="number"
            min={1}
            max={MAX_REPS}
            aria-label={`Set ${index + 1} reps`}
            value={set.reps}
            onChange={update(index, 'reps')}
            required
          />
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="Optional"
            aria-label={`Set ${index + 1} weight`}
            value={set.weight}
            onChange={update(index, 'weight')}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={`Remove set ${index + 1}`}
            disabled={value.length === 1}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={value.length >= MAX_SETS}
        // A new set starts like the last one, usually the closest match.
        onClick={() => onChange([...value, value[value.length - 1]])}
      >
        <Plus />
        Add set
      </Button>
    </div>
  );
}

type ExerciseLogFieldsProps = {
  idPrefix: string;
  /** What the calories were known for; edits scale them from here. */
  baseline: WorkValues;
  baselineCalories: number;
  value: ExerciseLogValues;
  onChange: (value: ExerciseLogValues) => void;
};

/** What was done, set by set for strength, plus the calories it burned. */
export function ExerciseLogFields({
  idPrefix,
  baseline,
  baselineCalories,
  value,
  onChange,
}: ExerciseLogFieldsProps) {
  function changeWork(work: WorkValues) {
    const scaled = value.caloriesEdited
      ? null
      : scaleCalories(baselineCalories, baseline, work);
    onChange({
      ...value,
      ...work,
      calories: scaled === null ? value.calories : String(scaled),
    });
  }

  return (
    <div className="space-y-4">
      {value.sets ? (
        <SetListFields
          value={value.sets}
          onChange={(sets) =>
            changeWork({durationMin: value.durationMin, sets})
          }
        />
      ) : (
        <div className="flex flex-col space-y-2">
          <Label htmlFor={`${idPrefix}-durationMin`}>Duration (min)</Label>
          <Input
            id={`${idPrefix}-durationMin`}
            type="number"
            min={1}
            value={value.durationMin}
            onChange={(event) =>
              changeWork({durationMin: event.target.value, sets: null})
            }
            required
          />
        </div>
      )}
      <div className="flex flex-col space-y-2">
        <Label htmlFor={`${idPrefix}-calories`}>Calories burned</Label>
        <Input
          id={`${idPrefix}-calories`}
          type="number"
          min={0}
          value={value.calories}
          onChange={(event) =>
            onChange({
              ...value,
              calories: event.target.value,
              caloriesEdited: true,
            })
          }
          required
        />
      </div>
    </div>
  );
}
