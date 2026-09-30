'use client';

import Link from 'next/link';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
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

type TodaysExercisePlanProps = {
  goals: PlannedExercise[];
  completedIds: ReadonlySet<string>;
  pendingId: string | null;
  error: string | null;
  onToggle: (goal: PlannedExercise, checked: boolean) => void;
};

export function TodaysExercisePlan({
  goals,
  completedIds,
  pendingId,
  error,
  onToggle,
}: TodaysExercisePlanProps) {
  const doneCount = goals.filter((goal) => completedIds.has(goal.id)).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Today&apos;s plan</CardTitle>
        {goals.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {doneCount} of {goals.length} done
          </span>
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
        ) : (
          <ul className="space-y-2">
            {goals.map((goal) => {
              const checked = completedIds.has(goal.id);
              const inputId = `planned-${goal.id}`;
              return (
                <li key={goal.id}>
                  <label
                    htmlFor={inputId}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      disabled={pendingId === goal.id}
                      onChange={(event) => onToggle(goal, event.target.checked)}
                      className="h-5 w-5 shrink-0 rounded border-input accent-primary disabled:cursor-wait disabled:opacity-50"
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
