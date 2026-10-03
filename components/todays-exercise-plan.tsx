'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Play} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {WorkoutSession, type WorkoutResult} from '@/components/workout-session';
import {unlockAudio} from '@/lib/workout-sound';
import {formatExerciseDetail} from '@/lib/exercise';

export type PlannedExercise = {
  id: string;
  name: string;
  type: string;
  calories: number;
  durationMin: number | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
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
    result?: WorkoutResult,
  ) {
    setPendingId(goal.id);
    setError(null);
    try {
      const response = checked
        ? await fetch('/api/exercise-goals/log', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({goalId: goal.id, ...result}),
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
    result?: WorkoutResult,
  ) => void;
  hideCompleted?: boolean;
};

export function TodaysExercisePlan({
  goals,
  completedIds,
  pendingId,
  error,
  onToggle,
  hideCompleted = false,
}: TodaysExercisePlanProps) {
  const [workout, setWorkout] = useState<{
    goal: PlannedExercise;
    startedAt: number;
  } | null>(null);
  const doneCount = goals.filter((goal) => completedIds.has(goal.id)).length;
  const visibleGoals = hideCompleted
    ? goals.filter((goal) => !completedIds.has(goal.id))
    : goals;

  if (workout) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="truncate">{workout.goal.name}</CardTitle>
          <CardDescription>Workout in progress</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkoutSession
            goal={workout.goal}
            startedAt={workout.startedAt}
            onComplete={(result) => {
              setWorkout(null);
              onToggle(workout.goal, true, result);
            }}
            onCancel={() => setWorkout(null)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s plan</CardTitle>
        {goals.length > 0 && (
          <CardDescription>
            {doneCount} of {goals.length} done
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned for today.{' '}
            <Link href="/goals" className="text-primary hover:underline">
              Plan exercise goals
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
                  <label
                    htmlFor={inputId}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 p-3"
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      disabled={pendingId === goal.id}
                      onChange={(event) => onToggle(goal, event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-input accent-primary disabled:cursor-wait disabled:opacity-50"
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
                        {formatExerciseDetail(goal)} · {goal.calories} kcal
                      </span>
                    </span>
                  </label>
                  {!checked && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mr-3"
                      aria-label={`Start ${goal.name}`}
                      disabled={pendingId === goal.id}
                      onClick={() => {
                        // Lets timed workouts start music without another tap.
                        unlockAudio();
                        setWorkout({goal, startedAt: Date.now()});
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
