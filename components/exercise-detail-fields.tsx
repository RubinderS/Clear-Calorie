'use client';

import {Plus, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Toggler, type TogglerOption} from '@/components/ui/toggler';
import {Decimal} from '@/lib/decimal';
import {
  MAX_SETS,
  setsOf,
  type ExerciseSet,
  type ExerciseWithSets,
} from '@/lib/exercise';
import {MAX_REPS} from '@/lib/workout';

/** A set is done either for reps or for a time. */
export type SetMode = 'reps' | 'time';

/** One set as typed; time is m:ss, or whole minutes. */
export type SetValues = {
  mode: SetMode;
  reps: string;
  time: string;
  weight: string;
};

export type ExerciseDetailValues = {sets: SetValues[]};

const EMPTY_SET: SetValues = {mode: 'reps', reps: '', time: '', weight: ''};

export const EMPTY_EXERCISE_DETAILS: ExerciseDetailValues = {
  sets: [EMPTY_SET],
};

// Minutes alone ("30"), or minutes and seconds ("1:30", "0:45").
const TIME_PATTERN = '\\d+(:[0-5]\\d)?';

export function toInt(value: string) {
  return new Decimal(Number(value))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
    .toNumber();
}

function optionalWeight(value: string) {
  return Number(value) > 0 ? Number(value) : null;
}

/** Seconds in an m:ss or whole-minutes time, or null if it isn't one. */
export function parseTime(value: string): number | null {
  const match = value.trim().match(/^(\d+)(?::([0-5]\d))?$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
  return seconds > 0 ? seconds : null;
}

export function formatTimeInput(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function toSetValues(set: ExerciseSet): SetValues {
  return {
    mode: set.reps != null ? 'reps' : 'time',
    reps: set.reps != null ? String(set.reps) : '',
    time: set.durationSec ? formatTimeInput(set.durationSec) : '',
    weight: set.weight != null ? String(set.weight) : '',
  };
}

function toSet(set: SetValues): ExerciseSet {
  const weight = optionalWeight(set.weight);
  return set.mode === 'reps'
    ? {reps: toInt(set.reps), weight}
    : {durationSec: parseTime(set.time) ?? 0, weight};
}

export function toDetailValues(item: ExerciseWithSets): ExerciseDetailValues {
  return {sets: setsOf(item).map(toSetValues)};
}

export function toDetailsPayload(values: ExerciseDetailValues) {
  return {exerciseSets: toSetsPayload(values.sets)};
}

type SetRowsProps = {
  idPrefix: string;
  sets: SetValues[];
  onChange: (sets: SetValues[]) => void;
  /** Each set's exercise, for a sequence's steps. */
  labels?: readonly string[];
  /** Sets can't be added or removed, e.g. a sequence's steps. */
  fixedCount?: boolean;
};

export const SET_MODES: TogglerOption<SetMode>[] = [
  {value: 'reps', label: 'Reps'},
  {value: 'time', label: 'Time'},
];

/** An input with its unit shown inside, so a typed value stays readable. */
export function UnitInput({
  unit,
  ...props
}: React.ComponentProps<typeof Input> & {unit: string}) {
  return (
    <div className="relative col-span-2 min-w-0 sm:col-span-1">
      <Input {...props} className="pl-3 pr-12" />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        {unit}
      </span>
    </div>
  );
}

/** Each set on its own row, done for reps or for a time, with its weight. */
function SetRows({
  idPrefix,
  sets,
  onChange,
  labels,
  fixedCount = false,
}: SetRowsProps) {
  function update(index: number, change: Partial<SetValues>) {
    onChange(sets.map((set, i) => (i === index ? {...set, ...change} : set)));
  }

  return (
    <div
      role="group"
      aria-label={labels ? 'Steps' : 'Sets'}
      className="space-y-4 sm:space-y-2"
    >
      {sets.map((set, index) => {
        const label = labels ? `Step ${index + 1}` : `Set ${index + 1}`;
        return (
          // On phones the type and remove button share the first line, then
          // the amount and the weight each get a full-width line.
          <div
            key={index}
            className={
              fixedCount
                ? 'grid grid-cols-2 items-center gap-2 sm:grid-cols-[auto_1fr_1fr]'
                : 'grid grid-cols-[1fr_2.25rem] items-center gap-2 sm:grid-cols-[auto_1fr_1fr_2.25rem]'
            }
          >
            {labels?.[index] ? (
              <p className="col-span-full text-sm font-medium">
                {index + 1}. {labels[index]}
              </p>
            ) : null}
            <Toggler
              name={`${idPrefix}-set-${index}-mode`}
              label={`${label} type`}
              options={SET_MODES}
              value={set.mode}
              onChange={(mode) => update(index, {mode})}
              className="justify-self-start"
            />
            {set.mode === 'reps' ? (
              <UnitInput
                unit="reps"
                type="number"
                min={1}
                max={MAX_REPS}
                aria-label={`${label} reps`}
                value={set.reps}
                onChange={(event) => update(index, {reps: event.target.value})}
                required
              />
            ) : (
              <UnitInput
                unit="m:ss"
                inputMode="numeric"
                pattern={TIME_PATTERN}
                placeholder="0:30"
                title="Minutes, or minutes:seconds, e.g. 30 or 0:45"
                aria-label={`${label} time`}
                value={set.time}
                onChange={(event) => update(index, {time: event.target.value})}
                required
              />
            )}
            <UnitInput
              unit="kg"
              type="number"
              min={0}
              step="any"
              placeholder="Optional"
              aria-label={`${label} weight`}
              value={set.weight}
              onChange={(event) => update(index, {weight: event.target.value})}
            />
            {fixedCount ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="col-start-2 row-start-1 h-9 w-9 sm:col-start-auto sm:row-start-auto"
                aria-label={`Remove set ${index + 1}`}
                disabled={sets.length === 1}
                onClick={() => onChange(sets.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            )}
          </div>
        );
      })}
      {fixedCount ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={sets.length >= MAX_SETS}
          // A new set starts like the last one, usually the closest match.
          onClick={() => onChange([...sets, sets[sets.length - 1]])}
        >
          <Plus />
          Add set
        </Button>
      )}
    </div>
  );
}

type ExerciseDetailFieldsProps = {
  idPrefix: string;
  value: ExerciseDetailValues;
  onChange: (value: ExerciseDetailValues) => void;
};

/** An exercise's planned sets, each for reps or a time, with its weight. */
export function ExerciseDetailFields({
  idPrefix,
  value,
  onChange,
}: ExerciseDetailFieldsProps) {
  return (
    <SetRows
      idPrefix={idPrefix}
      sets={value.sets}
      onChange={(sets) => onChange({sets})}
    />
  );
}

/** A log's work, set by set. */
export type WorkValues = {sets: SetValues[]};

export function toWorkValues(item: ExerciseWithSets): WorkValues {
  return {sets: setsOf(item).map(toSetValues)};
}

export function toSetsPayload(sets: readonly SetValues[]): ExerciseSet[] {
  return sets.map(toSet);
}

/** Each set as the exercise APIs take them. */
export function toLogPayload(values: WorkValues) {
  return {exerciseSets: toSetsPayload(values.sets)};
}

type ExerciseLogFieldsProps = {
  idPrefix: string;
  value: WorkValues;
  onChange: (value: WorkValues) => void;
  /** A sequence's exercises, one per step; its steps stay as planned. */
  stepNames?: readonly string[];
};

/** What was done, set by set. */
export function ExerciseLogFields({
  idPrefix,
  value,
  onChange,
  stepNames,
}: ExerciseLogFieldsProps) {
  return (
    <SetRows
      idPrefix={idPrefix}
      sets={value.sets}
      onChange={(sets) => onChange({sets})}
      labels={stepNames}
      fixedCount={stepNames !== undefined}
    />
  );
}
