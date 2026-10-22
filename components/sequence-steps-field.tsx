'use client';

import {useState} from 'react';
import {ArrowDown, ArrowUp, Copy, Plus, Trash2, X} from 'lucide-react';
import {ExerciseHowTo} from '@/components/exercise-animation';
import {
  SET_MODES,
  UnitInput,
  formatTimeInput,
  toEstimateDetails,
  toSetsPayload,
  type SetValues,
} from '@/components/exercise-detail-fields';
import {CatalogSuggestion} from '@/components/exercise-name-input';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select} from '@/components/ui/select';
import {Toggler} from '@/components/ui/toggler';
import {
  DEFAULT_BREAK_SEC,
  MAX_SEQUENCE_STEPS,
  describeSequence,
  formatDuration,
  type SequenceStep,
} from '@/lib/exercise';
import {exerciseCatalog, type CatalogEntry} from '@/lib/exercise-catalog';
import {MAX_REPS} from '@/lib/workout';

/** One step as typed; `restSec` is the break before it, 0 for none. */
export type StepDraft = {
  key: number;
  name: string;
  catalogId: string | null;
  set: SetValues;
  restSec: number;
};

const BREAK_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

let nextKey = 0;

export function toStepDrafts(steps: readonly SequenceStep[]): StepDraft[] {
  return steps.map((step) => ({
    key: nextKey++,
    name: step.name,
    catalogId: step.catalogId ?? null,
    set: {
      mode: step.reps != null ? 'reps' : 'time',
      reps: step.reps != null ? String(step.reps) : '',
      time: step.durationSec ? formatTimeInput(step.durationSec) : '',
      weight: step.weight != null ? String(step.weight) : '',
    },
    restSec: step.restSec,
  }));
}

/** Steps as the plan API takes them. */
export function toStepsPayload(drafts: readonly StepDraft[]): SequenceStep[] {
  return drafts.map((draft, index) => ({
    ...toSetsPayload([draft.set])[0],
    name: draft.name,
    catalogId: draft.catalogId,
    restSec: index === 0 ? 0 : draft.restSec,
  }));
}

/** A summary of every step for estimating calories, with the steps listed. */
export function toSequenceEstimate(drafts: readonly StepDraft[]) {
  return {
    ...toEstimateDetails({sets: drafts.map((draft) => draft.set)}),
    parts: describeSequence(toStepsPayload(drafts)),
  };
}

export function SequenceTag() {
  return (
    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      Sequence
    </span>
  );
}

/** A new step for a built-in exercise, or the user's own by name. */
function newStep(
  name: string,
  entry: CatalogEntry | undefined,
  restSec: number,
): StepDraft {
  // Cardio is usually done for a time; strength for reps.
  const timed = entry ? entry.type === 'TIME' : true;
  return {
    key: nextKey++,
    name: entry?.name ?? name,
    catalogId: entry?.id ?? null,
    set: timed
      ? {mode: 'time', reps: '', time: '0:45', weight: ''}
      : {mode: 'reps', reps: '12', time: '', weight: ''},
    restSec,
  };
}

/**
 * A sequence's steps in order, each one set of one exercise, with a break
 * between steps that can be changed or removed. Breaks stay in place when
 * steps are moved, so the rhythm of the sequence is kept.
 */
export function SequenceStepsField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
}) {
  // A new break copies the latest one, as breaks do during a workout.
  const lastBreak =
    value.findLast((step, index) => index > 0 && step.restSec > 0)?.restSec ??
    DEFAULT_BREAK_SEC;

  function update(index: number, change: Partial<StepDraft>) {
    onChange(
      value.map((step, i) => (i === index ? {...step, ...change} : step)),
    );
  }

  /** Swaps two steps' exercises, leaving the breaks where they are. */
  function swap(a: number, b: number) {
    onChange(
      value.map((step, i) =>
        i === a
          ? {...value[b], restSec: step.restSec}
          : i === b
            ? {...value[a], restSec: step.restSec}
            : step,
      ),
    );
  }

  function duplicate(index: number) {
    const copy = {...value[index], key: nextKey++, restSec: lastBreak};
    onChange([...value.slice(0, index + 1), copy, ...value.slice(index + 1)]);
  }

  return (
    <div role="group" aria-label="Steps" className="space-y-2">
      {value.map((step, index) => {
        const label = `Step ${index + 1}`;
        return (
          <div key={step.key} className="space-y-2">
            {index > 0 && (
              <BreakRow
                id={`${idPrefix}-break-${step.key}`}
                step={index + 1}
                restSec={step.restSec}
                defaultSec={lastBreak}
                onChange={(restSec) => update(index, {restSec})}
              />
            )}
            <div
              role="group"
              aria-label={`${label}: ${step.name}`}
              className="space-y-2 rounded-xl border border-border/50 bg-muted/30 p-3"
            >
              <div className="flex items-center gap-1">
                <p className="wrap-break-word min-w-0 flex-1 text-sm font-medium">
                  {index + 1}. {step.name}
                </p>
                <ExerciseHowTo
                  catalogId={step.catalogId}
                  className="-my-1"
                  compact
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Move step ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => swap(index, index - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Move step ${index + 1} down`}
                  disabled={index === value.length - 1}
                  onClick={() => swap(index, index + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Repeat step ${index + 1}`}
                  title="Repeat, e.g. for another set"
                  disabled={value.length >= MAX_SEQUENCE_STEPS}
                  onClick={() => duplicate(index)}
                >
                  <Copy />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[auto_1fr_1fr]">
                <Toggler
                  name={`${idPrefix}-step-${step.key}-mode`}
                  label={`${label} type`}
                  options={SET_MODES}
                  value={step.set.mode}
                  onChange={(mode) => update(index, {set: {...step.set, mode}})}
                  className="col-span-2 justify-self-start sm:col-span-1"
                />
                {step.set.mode === 'reps' ? (
                  <UnitInput
                    unit="reps"
                    type="number"
                    min={1}
                    max={MAX_REPS}
                    aria-label={`${label} reps`}
                    value={step.set.reps}
                    onChange={(event) =>
                      update(index, {
                        set: {...step.set, reps: event.target.value},
                      })
                    }
                    required
                  />
                ) : (
                  <UnitInput
                    unit="m:ss"
                    inputMode="numeric"
                    pattern={'\\d+(:[0-5]\\d)?'}
                    placeholder="0:45"
                    title="Minutes, or minutes:seconds, e.g. 1 or 0:45"
                    aria-label={`${label} time`}
                    value={step.set.time}
                    onChange={(event) =>
                      update(index, {
                        set: {...step.set, time: event.target.value},
                      })
                    }
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
                  value={step.set.weight}
                  onChange={(event) =>
                    update(index, {
                      set: {...step.set, weight: event.target.value},
                    })
                  }
                />
              </div>
            </div>
          </div>
        );
      })}
      <StepPicker
        id={`${idPrefix}-add`}
        disabled={value.length >= MAX_SEQUENCE_STEPS}
        onAdd={(name, entry) =>
          onChange([
            ...value,
            newStep(name, entry, value.length > 0 ? lastBreak : 0),
          ])
        }
      />
    </div>
  );
}

function BreakRow({
  id,
  step,
  restSec,
  defaultSec,
  onChange,
}: {
  id: string;
  step: number;
  restSec: number;
  defaultSec: number;
  onChange: (restSec: number) => void;
}) {
  if (restSec === 0) {
    return (
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          aria-label={`Add break before step ${step}`}
          onClick={() => onChange(defaultSec)}
        >
          <Plus />
          Add break
        </Button>
      </div>
    );
  }
  const options = BREAK_OPTIONS.includes(restSec)
    ? BREAK_OPTIONS
    : [...BREAK_OPTIONS, restSec].sort((a, b) => a - b);
  return (
    <div className="flex items-center justify-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        Break
      </label>
      <Select
        id={id}
        aria-label={`Break before step ${step}`}
        value={restSec}
        onChange={(event) => onChange(Number(event.target.value))}
        wrapperClassName="w-28"
        className="h-9"
      >
        {options.map((seconds) => (
          <option key={seconds} value={seconds}>
            {formatDuration(seconds)}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground"
        aria-label={`Remove break before step ${step}`}
        onClick={() => onChange(0)}
      >
        <X />
      </Button>
    </div>
  );
}

/** Adds a built-in exercise from the suggestions, or the user's own by name. */
function StepPicker({
  id,
  disabled,
  onAdd,
}: {
  id: string;
  disabled: boolean;
  onAdd: (name: string, entry: CatalogEntry | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const suggestions = open ? exerciseCatalog.search(query, {limit: 6}) : [];

  function add(entry?: CatalogEntry) {
    const name = query.trim();
    const picked = entry ?? exerciseCatalog.linkFor(name) ?? undefined;
    if (!picked && !name) return;
    onAdd(name, picked);
    setQuery('');
  }

  return (
    <div className="relative flex gap-2">
      <Input
        id={id}
        aria-label="Add an exercise to the sequence"
        placeholder="Add exercise, e.g. jumping jacks"
        value={query}
        disabled={disabled}
        maxLength={100}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          // Enter adds the step rather than submitting the whole form.
          event.preventDefault();
          add();
        }}
        className="min-w-0 flex-1"
      />
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        disabled={disabled || !query.trim()}
        onClick={() => add()}
      >
        <Plus />
        Add
      </Button>
      {suggestions.length > 0 && (
        <ul
          aria-label="Built-in exercises"
          className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border/50 bg-background shadow-lg"
        >
          {suggestions.map((entry) => (
            <CatalogSuggestion key={entry.id} entry={entry} onPick={add} />
          ))}
        </ul>
      )}
    </div>
  );
}
