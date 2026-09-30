'use client';

import {Utensils} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
import {FoodForm} from '@/components/food-form';
import {sumNumbers} from '@/lib/decimal';

type FoodEntry = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  loggedAt: string | Date;
};

type FoodLogProps = {
  entries: FoodEntry[];
  timeZone: string;
  today: string;
};

export function FoodLog({entries, timeZone, today}: FoodLogProps) {
  const log = useDailyLog({endpoint: '/api/food', initialEntries: entries, today});
  const totalCalories = sumNumbers(log.entries.map((entry) => entry.calories));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <FoodForm onLogCreated={log.showTodayAndRefresh} />

      <DailyLogCard
        log={log}
        timeZone={timeZone}
        todayTitle="Today's entries"
        dateInputLabel="View food logs for date"
        summary={`${totalCalories} calories`}
        loadingText="Loading entries..."
        emptyText="No food logged"
        icon={Utensils}
        iconClassName="bg-primary/10 text-primary"
        renderDetail={(entry) =>
          `P: ${entry.protein}g · C: ${entry.carbs}g · F: ${entry.fat}g · Sat: ${entry.saturatedFat}g`
        }
      />
    </div>
  );
}
