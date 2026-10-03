'use client';

import {useMemo} from 'react';
import {Dumbbell} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
import {ExerciseForm} from '@/components/exercise-form';
import {
  TodaysExercisePlan,
  usePlannedExerciseToggle,
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
  const plan = usePlannedExerciseToggle(
    initialEntries.flatMap((entry) =>
      entry.exerciseGoalId ? [entry.exerciseGoalId] : [],
    ),
  );
  const plannedNames = useMemo(
    () => plannedGoals.map((goal) => goal.name),
    [plannedGoals],
  );
  const log = useDailyLog({
    endpoint: '/api/exercise',
    initialEntries,
    today,
    onDeleted: (entry) => {
      if (entry.exerciseGoalId) plan.markCompleted(entry.exerciseGoalId, false);
    },
  });

  const totalBurned = sumNumbers(log.entries.map((entry) => entry.calories));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <TodaysExercisePlan
          goals={plannedGoals}
          completedIds={plan.completedIds}
          pendingId={plan.pendingId}
          error={plan.error}
          onToggle={(goal, checked, result) =>
            void plan.toggle(goal, checked, result).then((ok) => {
              if (ok) log.showTodayAndRefresh();
            })
          }
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
        summary={`${totalBurned} calories burned`}
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
