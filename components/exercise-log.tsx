'use client';

import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Dumbbell} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
import {ExerciseForm} from '@/components/exercise-form';
import {
  TodaysExercisePlan,
  type PlannedExercise,
} from '@/components/todays-exercise-plan';
import {sumNumbers} from '@/lib/decimal';
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
  loggedAt: string | Date;
};

type ExerciseLogProps = {
  entries: ExerciseEntry[];
  plannedGoals: PlannedExercise[];
  timeZone: string;
  today: string;
};

export function ExerciseLog({
  entries: initialEntries,
  plannedGoals,
  timeZone,
  today,
}: ExerciseLogProps) {
  const router = useRouter();
  const [completedGoalIds, setCompletedGoalIds] = useState<Set<string>>(
    () =>
      new Set(
        initialEntries.flatMap((entry) =>
          entry.exerciseGoalId ? [entry.exerciseGoalId] : [],
        ),
      ),
  );
  const [togglingGoalId, setTogglingGoalId] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const plannedNames = useMemo(
    () => plannedGoals.map((goal) => goal.name),
    [plannedGoals],
  );
  const log = useDailyLog({
    endpoint: '/api/exercise',
    initialEntries,
    today,
    onDeleted: (entry) => {
      if (entry.exerciseGoalId) markGoalCompleted(entry.exerciseGoalId, false);
    },
  });

  function markGoalCompleted(goalId: string, completed: boolean) {
    setCompletedGoalIds((current) => {
      const next = new Set(current);
      if (completed) next.add(goalId);
      else next.delete(goalId);
      return next;
    });
  }

  async function handleToggleGoal(goal: PlannedExercise, checked: boolean) {
    setTogglingGoalId(goal.id);
    setPlanError(null);
    try {
      const response = checked
        ? await fetch('/api/exercise-goals/log', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({goalId: goal.id}),
          })
        : await fetch(`/api/exercise-goals/log?goalId=${goal.id}`, {
            method: 'DELETE',
          });
      // 404 on untick means the log was already removed elsewhere
      if (response.ok || (!checked && response.status === 404)) {
        markGoalCompleted(goal.id, checked);
        log.showTodayAndRefresh();
        router.refresh();
      } else {
        const payload = await response.json().catch(() => null);
        setPlanError(payload?.error ?? `Failed to update "${goal.name}"`);
      }
    } catch {
      setPlanError(`Failed to update "${goal.name}"`);
    } finally {
      setTogglingGoalId(null);
    }
  }

  const totalBurned = sumNumbers(log.entries.map((entry) => entry.calories));
  const totalDuration = sumNumbers(
    log.entries.map((entry) => entry.durationMin),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <TodaysExercisePlan
          goals={plannedGoals}
          completedIds={completedGoalIds}
          pendingId={togglingGoalId}
          error={planError}
          onToggle={(goal, checked) => void handleToggleGoal(goal, checked)}
        />
        <ExerciseForm
          plannedNames={plannedNames}
          onLogCreated={log.showTodayAndRefresh}
        />
      </div>

      <DailyLogCard
        log={log}
        timeZone={timeZone}
        todayTitle="Today's workouts"
        dateInputLabel="View exercise logs for date"
        summary={`${totalBurned} calories burned · ${totalDuration} minutes`}
        loadingText="Loading workouts..."
        emptyText="No exercise logged"
        icon={Dumbbell}
        iconClassName="bg-orange-500/10 text-orange-500"
        renderDetail={(entry) =>
          `${formatExerciseDetail(entry)}${entry.exerciseGoalId ? ' · Planned' : ''}`
        }
      />
    </div>
  );
}
