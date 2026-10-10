'use client';

import {useState} from 'react';
import {Dumbbell} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
import {GoalNotes} from '@/components/goal-notes';
import {
  ExerciseDetailFields,
  toDetailValues,
  toDetailsPayload,
  type ExerciseDetailValues,
} from '@/components/exercise-detail-fields';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Decimal, sumNumbers} from '@/lib/decimal';
import {formatExerciseDetail} from '@/lib/exercise';

type ExerciseEntry = {
  id: string;
  name: string;
  type: string;
  calories: number;
  durationMin: number;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  exerciseGoalId: string | null;
  exerciseGoal?: {notes: string | null} | null;
  loggedAt: string | Date;
};

type ExerciseLogProps = {
  entries: ExerciseEntry[];
  timeZone: string;
  today: string;
};

export function ExerciseLog({entries, timeZone, today}: ExerciseLogProps) {
  const log = useDailyLog({
    endpoint: '/api/exercise',
    initialEntries: entries,
    today,
  });
  const [editingEntry, setEditingEntry] = useState<ExerciseEntry | null>(null);

  const totalBurned = sumNumbers(log.entries.map((entry) => entry.calories));

  return (
    <>
      <DailyLogCard
        log={log}
        timeZone={timeZone}
        todayTitle="Today's workouts"
        dateInputLabel="View exercise logs for date"
        summary={`${totalBurned} calories burned`}
        loadingText="Loading workouts..."
        emptyText="No exercise logged"
        icon={Dumbbell}
        iconClassName="bg-orange-500/10 text-orange-500"
        renderDetail={(entry) =>
          `${formatExerciseDetail(entry)}${entry.exerciseGoalId ? ' · Planned' : ''}`
        }
        onEdit={setEditingEntry}
      />
      <Dialog
        open={editingEntry !== null}
        onClose={() => setEditingEntry(null)}
        label="Edit exercise"
      >
        {editingEntry && (
          <EditExerciseForm
            entry={editingEntry}
            onSaved={(updated) => {
              log.replaceEntry(updated);
              setEditingEntry(null);
            }}
            onNotesSaved={(notes) =>
              log.replaceEntry({...editingEntry, exerciseGoal: {notes}})
            }
          />
        )}
      </Dialog>
    </>
  );
}

/** Relative amount of work, used to scale calories when the details change. */
function workRatio(from: ExerciseDetailValues, to: ExerciseDetailValues) {
  if (to.type === 'STRENGTH') {
    const fromVolume = Number(from.sets) * Number(from.reps);
    const toVolume = Number(to.sets) * Number(to.reps);
    const fromWeight = Number(from.weight);
    const toWeight = Number(to.weight);
    const weightRatio =
      fromWeight > 0 && toWeight > 0 ? toWeight / fromWeight : 1;
    return fromVolume > 0 ? (toVolume / fromVolume) * weightRatio : null;
  }
  const fromDuration = Number(from.durationMin);
  return fromDuration > 0 ? Number(to.durationMin) / fromDuration : null;
}

type EditExerciseFormProps = {
  entry: ExerciseEntry;
  onSaved: (entry: ExerciseEntry) => void;
  onNotesSaved: (notes: string | null) => void;
};

function EditExerciseForm({
  entry,
  onSaved,
  onNotesSaved,
}: EditExerciseFormProps) {
  const [original] = useState(() => toDetailValues(entry));
  const [details, setDetails] = useState(original);
  const [calories, setCalories] = useState(String(entry.calories));
  // Calories follow the details proportionally until the user sets them.
  const [caloriesEdited, setCaloriesEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDetailsChange(next: ExerciseDetailValues) {
    setDetails(next);
    if (caloriesEdited) return;
    const ratio = workRatio(original, next);
    if (ratio !== null && Number.isFinite(ratio)) {
      setCalories(
        String(
          new Decimal(entry.calories)
            .times(ratio)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
            .toNumber(),
        ),
      );
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch('/api/exercise', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          id: entry.id,
          calories: new Decimal(Number(calories))
            .toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
            .toNumber(),
          ...toDetailsPayload(details),
        }),
      });

      if (response.ok) {
        onSaved(await response.json());
      } else {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? 'Failed to update exercise');
      }
    } catch {
      setError('Failed to update exercise');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <div className="pr-8">
        <h2 className="text-lg font-semibold">{entry.name}</h2>
        <p className="text-sm text-muted-foreground">
          Log what you actually did
        </p>
      </div>
      <ExerciseDetailFields
        idPrefix="edit-exercise"
        value={details}
        onChange={handleDetailsChange}
        lockType
      />
      <div className="flex flex-col space-y-2">
        <Label htmlFor="edit-exercise-calories">Calories burned</Label>
        <Input
          id="edit-exercise-calories"
          type="number"
          min={0}
          value={calories}
          onChange={(event) => {
            setCalories(event.target.value);
            setCaloriesEdited(true);
          }}
          required
        />
      </div>
      {entry.exerciseGoalId && (
        <GoalNotes
          goalId={entry.exerciseGoalId}
          initialNotes={entry.exerciseGoal?.notes ?? null}
          onSaved={onNotesSaved}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </form>
  );
}
