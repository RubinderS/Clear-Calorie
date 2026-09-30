'use client';

import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {addDays, format, parseISO} from 'date-fns';
import {ChevronLeft, ChevronRight, Dumbbell, Trash2} from 'lucide-react';
import {ExerciseForm} from '@/components/exercise-form';
import {
  TodaysExercisePlan,
  type PlannedExercise,
} from '@/components/todays-exercise-plan';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
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
  const [selectedDate, setSelectedDate] = useState(today);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [entries, setEntries] = useState(initialEntries);
  const [isLoading, setIsLoading] = useState(() => initialEntries.length === 0);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      setIsLoading(true);
      const response = await fetch(`/api/exercise?date=${selectedDate}`);
      if (!isMounted) return;
      if (response.ok) {
        setEntries(await response.json());
      }
      setIsLoading(false);
    }

    void loadEntries();

    return () => {
      isMounted = false;
    };
  }, [selectedDate, refreshVersion]);

  function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
    const date = event.target.value;
    if (date) {
      setSelectedDate(date);
    }
  }

  function handleLogCreated() {
    setSelectedDate(today);
    setRefreshVersion((version) => version + 1);
  }

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
        handleLogCreated();
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

  async function handleDelete(entry: ExerciseEntry) {
    if (!window.confirm(`Delete ${entry.name}? This cannot be undone.`)) {
      return;
    }

    const {id: entryId} = entry;
    setDeletingEntryId(entryId);
    try {
      const response = await fetch(`/api/exercise?id=${entryId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setEntries((currentEntries) =>
          currentEntries.filter((entry) => entry.id !== entryId),
        );
        if (entry.exerciseGoalId) {
          markGoalCompleted(entry.exerciseGoalId, false);
        }
      }
    } finally {
      setDeletingEntryId(null);
    }
  }

  const isToday = selectedDate === today;
  const totalBurned = sumNumbers(entries.map((entry) => entry.calories));
  const totalDuration = sumNumbers(entries.map((entry) => entry.durationMin));
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

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
          onLogCreated={handleLogCreated}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            {isToday
              ? "Today's workouts"
              : format(parseISO(selectedDate), 'MMMM d, yyyy')}
          </CardTitle>
          <div className="flex w-full items-center justify-between gap-1 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous day"
              title="Previous day"
              onClick={() =>
                setSelectedDate((date) =>
                  format(addDays(parseISO(date), -1), 'yyyy-MM-dd'),
                )
              }
              className="h-9 w-9 shrink-0"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <input
              aria-label="View exercise logs for date"
              type="date"
              value={selectedDate}
              max={today}
              onChange={handleDateChange}
              className="h-9 min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next day"
              title="Next day"
              disabled={selectedDate >= today}
              onClick={() =>
                setSelectedDate((date) =>
                  format(addDays(parseISO(date), 1), 'yyyy-MM-dd'),
                )
              }
              className="h-9 w-9 shrink-0"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {totalBurned} calories burned · {totalDuration} minutes
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading workouts...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No exercise logged {isToday ? 'today' : 'on this date'}.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                      <Dumbbell className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatExerciseDetail(entry)}
                        {entry.exerciseGoalId && ' · Planned'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-semibold">{entry.calories} kcal</p>
                      <p className="text-xs text-muted-foreground">
                        {timeFormatter.format(new Date(entry.loggedAt))}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${entry.name}`}
                      title={`Delete ${entry.name}`}
                      disabled={!isToday || deletingEntryId === entry.id}
                      onClick={() => void handleDelete(entry)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-500/30 dark:hover:text-red-200"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
