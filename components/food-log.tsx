'use client';

import {useState} from 'react';
import {AlertTriangle, Utensils} from 'lucide-react';
import {DailyLogCard, useDailyLog} from '@/components/daily-log';
import {Dialog} from '@/components/ui/dialog';
import {sumNumbers} from '@/lib/decimal';
import {cn} from '@/lib/utils';

type FoodEntry = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  healthAlertLevel?: string | null;
  healthAlertMessage?: string | null;
  loggedAt: string | Date;
};

type FoodLogProps = {
  entries: FoodEntry[];
  timeZone: string;
  today: string;
};

const alertColor = (level?: string | null) =>
  level === 'avoid'
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400';

export function FoodLog({entries, timeZone, today}: FoodLogProps) {
  const log = useDailyLog({
    endpoint: '/api/food',
    initialEntries: entries,
    today,
  });
  const totalCalories = sumNumbers(log.entries.map((entry) => entry.calories));
  const [alertEntry, setAlertEntry] = useState<FoodEntry | null>(null);

  return (
    <>
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
        renderBadge={(entry) =>
          entry.healthAlertMessage && (
            <button
              type="button"
              aria-label={`Show health alert for ${entry.name}`}
              title="Health alert"
              onClick={() => setAlertEntry(entry)}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring',
                alertColor(entry.healthAlertLevel),
                entry.healthAlertLevel === 'avoid'
                  ? 'bg-red-500/10 hover:bg-red-500/20'
                  : 'bg-amber-500/10 hover:bg-amber-500/20',
              )}
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
            </button>
          )
        }
      />
      <Dialog
        open={alertEntry !== null}
        onClose={() => setAlertEntry(null)}
        label="Health alert"
      >
        {alertEntry && (
          <div className="space-y-3 p-6">
            <div
              className={cn(
                'flex items-center gap-2 pr-8 font-semibold',
                alertColor(alertEntry.healthAlertLevel),
              )}
            >
              <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
              {alertEntry.healthAlertLevel === 'avoid'
                ? 'Best avoided'
                : 'Eat with caution'}
            </div>
            <p className="font-medium">{alertEntry.name}</p>
            <p className="text-sm">{alertEntry.healthAlertMessage}</p>
            <p className="text-xs text-muted-foreground">
              Raised by the AI estimate based on your health notes. Not
              medical advice.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
