'use client';

import {useState} from 'react';
import {Dumbbell} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
import {
  AddLogButton,
  type PlannedExerciseStatus,
} from '@/components/quick-log';
import {GoalNotes} from '@/components/goal-notes';
import {
  ExerciseLogFields,
  initialLogValues,
  toLogPayload,
  toWorkValues,
} from '@/components/exercise-detail-fields';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {sumNumbers} from '@/lib/decimal';
import {formatExerciseDetail, type ExerciseSet} from '@/lib/exercise';

type ExerciseEntry = {
  id: string;
  name: string;
  type: string;
  calories: number;
  durationMin: number;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  exerciseSets?: ExerciseSet[];
  exerciseGoalId: string | null;
  exerciseGoal?: {notes: string | null} | null;
  loggedAt: string | Date;
};

type ExerciseLogProps = {
  entries: ExerciseEntry[];
  timeZone: string;
  today: string;
  /** Today's plan, ticked off from the add dialog. */
  plannedExercises?: PlannedExerciseStatus[];
};

export function ExerciseLog({
  entries,
  timeZone,
  today,
  plannedExercises,
}: ExerciseLogProps) {
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
        action={
          <AddLogButton
            panel="exercise"
            label="Add exercise"
            plannedExercises={plannedExercises}
            onLogged={log.showTodayAndRefresh}
          />
        }
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
  const [original] = useState(() => toWorkValues(entry));
  const [values, setValues] = useState(() =>
    initialLogValues(original, entry.calories),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch('/api/exercise', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: entry.id, ...toLogPayload(values)}),
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
      <ExerciseLogFields
        idPrefix="edit-exercise"
        baseline={original}
        baselineCalories={entry.calories}
        value={values}
        onChange={setValues}
      />
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
