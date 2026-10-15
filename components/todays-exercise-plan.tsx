'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Check, Play, X} from 'lucide-react';
import {
  ExerciseLogFields,
  initialLogValues,
  toLogPayload,
  toWorkValues,
  type ExerciseLogValues,
  type WorkValues,
} from '@/components/exercise-detail-fields';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {WorkoutSession, type WorkoutResult} from '@/components/workout-session';
import {
  createWorkoutSound,
  loadWorkoutVoice,
  unlockAudio,
  type WorkoutSound,
} from '@/lib/workout-sound';
import {formatExerciseDetail, type ExerciseSet} from '@/lib/exercise';

export type PlannedExercise = {
  id: string;
  name: string;
  type: string;
  calories: number;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  tempoMs: number | null;
  notes: string | null;
};

/** What was actually done, where it differs from the goal. */
export type LogDetails = {
  exerciseSets?: ExerciseSet[];
  durationMin?: number;
  calories?: number;
};

export function usePlannedExerciseToggle(initialCompletedIds: string[]) {
  const router = useRouter();
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(initialCompletedIds),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function markCompleted(goalId: string, completed: boolean) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (completed) next.add(goalId);
      else next.delete(goalId);
      return next;
    });
  }

  async function toggle(
    goal: PlannedExercise,
    checked: boolean,
    details?: LogDetails,
  ) {
    setPendingId(goal.id);
    setError(null);
    try {
      const response = checked
        ? await fetch('/api/exercise-goals/log', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({goalId: goal.id, ...details}),
          })
        : await fetch(`/api/exercise-goals/log?goalId=${goal.id}`, {
            method: 'DELETE',
          });
      // 404 on untick means the log was already removed elsewhere
      if (response.ok || (!checked && response.status === 404)) {
        markCompleted(goal.id, checked);
        router.refresh();
        return true;
      }
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? `Failed to update "${goal.name}"`);
    } catch {
      setError(`Failed to update "${goal.name}"`);
    } finally {
      setPendingId(null);
    }
    return false;
  }

  return {completedIds, pendingId, error, markCompleted, toggle};
}

type TodaysExercisePlanProps = {
  goals: PlannedExercise[];
  completedIds: ReadonlySet<string>;
  pendingId: string | null;
  error: string | null;
  onToggle: (
    goal: PlannedExercise,
    checked: boolean,
    details?: LogDetails,
  ) => void;
  hideCompleted?: boolean;
  /** Shown under the title, e.g. a link to past logs. */
  headerAction?: React.ReactNode;
};

export function TodaysExercisePlan({
  goals,
  completedIds,
  pendingId,
  error,
  onToggle,
  hideCompleted = false,
  headerAction,
}: TodaysExercisePlanProps) {
  const [workout, setWorkout] = useState<{
    goal: PlannedExercise;
    sound: WorkoutSound | null;
  } | null>(null);
  // Logs wait here so the user can correct what they did before saving.
  const [review, setReview] = useState<{
    goal: PlannedExercise;
    result?: WorkoutResult;
  } | null>(null);
  const hasGoals = goals.length > 0;
  // Workouts wait for the voice before starting, so get it loading early.
  useEffect(() => {
    if (hasGoals) void loadWorkoutVoice();
  }, [hasGoals]);
  const doneCount = goals.filter((goal) => completedIds.has(goal.id)).length;
  const visibleGoals = hideCompleted
    ? goals.filter((goal) => !completedIds.has(goal.id))
    : goals;

  if (workout) {
    return (
      <Card>
        <CardHeader className="pr-14">
          <CardTitle className="truncate">{workout.goal.name}</CardTitle>
          <CardDescription>Workout in progress</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkoutSession
            goal={workout.goal}
            sound={workout.sound}
            onComplete={(result) => {
              setWorkout(null);
              setReview({goal: workout.goal, result});
            }}
            onCancel={() => setWorkout(null)}
          />
        </CardContent>
      </Card>
    );
  }

  if (review) {
    return (
      <Card>
        <CardHeader className="pr-14">
          <CardTitle className="truncate">{review.goal.name}</CardTitle>
          <CardDescription>Check what you did, then log it</CardDescription>
        </CardHeader>
        <CardContent>
          <LogReview
            goal={review.goal}
            result={review.result}
            onConfirm={(details) => {
              setReview(null);
              onToggle(review.goal, true, details);
            }}
            onCancel={() => setReview(null)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pr-14">
        <CardTitle>Today&apos;s plan</CardTitle>
        {goals.length > 0 && (
          <CardDescription>
            {doneCount} of {goals.length} done
          </CardDescription>
        )}
        {headerAction}
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned for today.{' '}
            <Link href="/exercise-plan" className="text-primary hover:underline">
              Plan your exercises
            </Link>
          </p>
        ) : visibleGoals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All planned exercises done.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleGoals.map((goal) => {
              const checked = completedIds.has(goal.id);
              const inputId = `planned-${goal.id}`;
              return (
                <li
                  key={goal.id}
                  className="flex items-center rounded-xl border border-border/50 bg-muted/30 transition-colors hover:bg-muted/50"
                >
                  {/* Only the checkbox toggles completion; a wrapping label
                      made taps on the name tick exercises off by mistake. */}
                  <div className="flex min-w-0 flex-1 items-start gap-3 p-3">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      disabled={pendingId === goal.id}
                      onChange={(event) =>
                        event.target.checked
                          ? setReview({goal})
                          : onToggle(goal, false)
                      }
                      aria-label={`Mark ${goal.name} as done`}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-input accent-primary disabled:cursor-wait disabled:opacity-50"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          checked
                            ? 'block truncate font-medium text-muted-foreground line-through'
                            : 'block truncate font-medium'
                        }
                      >
                        {goal.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatExerciseDetail(goal)}
                        {goal.calories > 0 && ` · ${goal.calories} kcal`}
                      </span>
                      {goal.notes && (
                        <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                          {goal.notes}
                        </span>
                      )}
                    </span>
                  </div>
                  {!checked && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mr-3"
                      aria-label={`Start ${goal.name}`}
                      disabled={pendingId === goal.id}
                      onClick={() => {
                        // Timed workouts start without another tap, so their
                        // countdown voice and music must be unlocked by this one.
                        let sound: WorkoutSound | null = null;
                        if (goal.type === 'STRENGTH') {
                          unlockAudio();
                        } else {
                          sound = createWorkoutSound();
                        }
                        setWorkout({goal, sound});
                      }}
                    >
                      <Play />
                      Start
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Only what differs from the goal, which the server logs by default. */
function changedDetails(
  goal: PlannedExercise,
  values: ExerciseLogValues,
): LogDetails {
  const payload = toLogPayload(values);
  const changes: LogDetails = {};
  if (payload.type === 'STRENGTH') {
    const asPlanned =
      payload.exerciseSets.length === goal.sets &&
      payload.exerciseSets.every(
        (set) => set.reps === goal.reps && set.weight === goal.weight,
      );
    if (!asPlanned) changes.exerciseSets = payload.exerciseSets;
  } else if (payload.durationMin !== goal.durationMin) {
    changes.durationMin = payload.durationMin;
  }
  if (payload.calories !== goal.calories) changes.calories = payload.calories;
  return changes;
}

/** The goal's work, with the reps of each set from a workout if there was one. */
function doneWork(planned: WorkValues, result?: WorkoutResult): WorkValues {
  if (!result || !planned.sets) return planned;
  const {weight} = planned.sets[0];
  return {
    ...planned,
    sets: result.setReps.map((reps) => ({reps: String(reps), weight})),
  };
}

function LogReview({
  goal,
  result,
  onConfirm,
  onCancel,
}: {
  goal: PlannedExercise;
  result?: WorkoutResult;
  onConfirm: (details: LogDetails) => void;
  onCancel: () => void;
}) {
  const [planned] = useState(() => toWorkValues(goal));
  const [values, setValues] = useState(() =>
    initialLogValues(planned, goal.calories, doneWork(planned, result)),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(changedDetails(goal, values));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ExerciseLogFields
        idPrefix={`log-${goal.id}`}
        baseline={planned}
        baselineCalories={goal.calories}
        value={values}
        onChange={setValues}
      />
      <Button type="submit" className="h-12 w-full">
        <Check />
        Set done
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={onCancel}
      >
        <X />
        Cancel without logging
      </Button>
    </form>
  );
}
