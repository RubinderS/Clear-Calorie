'use client';

import {useEffect, useState} from 'react';
import {format, parseISO} from 'date-fns';
import {Dumbbell} from 'lucide-react';
import {ExerciseForm} from '@/components/exercise-form';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

type ExerciseEntry = {
  id: string;
  name: string;
  calories: number;
  durationMin: number;
  loggedAt: string | Date;
};

type ExerciseLogProps = {
  entries: ExerciseEntry[];
  timeZone: string;
  today: string;
};

export function ExerciseLog({
  entries: initialEntries,
  timeZone,
  today,
}: ExerciseLogProps) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries] = useState(initialEntries);
  const [isLoading, setIsLoading] = useState(false);

  async function loadEntries(date: string) {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/exercise?date=${date}`);
      if (response.ok) {
        setEntries(await response.json());
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedDate !== today) {
      void loadEntries(selectedDate);
    }
  }, [selectedDate, today]);

  function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
    const date = event.target.value;
    if (date) {
      setSelectedDate(date);
    }
  }

  function handleLogCreated() {
    setSelectedDate(today);
    void loadEntries(today);
  }

  const isToday = selectedDate === today;
  const totalBurned = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const totalDuration = entries.reduce(
    (sum, entry) => sum + entry.durationMin,
    0,
  );
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ExerciseForm onLogCreated={handleLogCreated} />

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            {isToday
              ? "Today's workouts"
              : format(parseISO(selectedDate), 'MMMM d, yyyy')}
          </CardTitle>
          <input
            aria-label="View exercise logs for date"
            type="date"
            value={selectedDate}
            max={today}
            onChange={handleDateChange}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          />
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
                        {entry.durationMin} minutes
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{entry.calories} kcal</p>
                    <p className="text-xs text-muted-foreground">
                      {timeFormatter.format(new Date(entry.loggedAt))}
                    </p>
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
