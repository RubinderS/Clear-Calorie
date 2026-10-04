'use client';

import {Dumbbell} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
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
  timeZone: string;
  today: string;
};

export function ExerciseLog({entries, timeZone, today}: ExerciseLogProps) {
  const log = useDailyLog({
    endpoint: '/api/exercise',
    initialEntries: entries,
    today,
  });

  const totalBurned = sumNumbers(log.entries.map((entry) => entry.calories));

  return (
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
  );
}
