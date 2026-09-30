'use client';

import {useEffect, useState} from 'react';
import {addDays, format, parseISO} from 'date-fns';
import {ChevronLeft, ChevronRight, Trash2, Utensils} from 'lucide-react';
import {FoodForm} from '@/components/food-form';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
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

export function FoodLog({
  entries: initialEntries,
  timeZone,
  today,
}: FoodLogProps) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [entries, setEntries] = useState(initialEntries);
  const [isLoading, setIsLoading] = useState(() => initialEntries.length === 0);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      setIsLoading(true);
      const response = await fetch(`/api/food?date=${selectedDate}`);
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

  async function handleDelete(entry: FoodEntry) {
    if (!window.confirm(`Delete ${entry.name}? This cannot be undone.`)) {
      return;
    }

    const {id: entryId} = entry;
    setDeletingEntryId(entryId);
    try {
      const response = await fetch(`/api/food?id=${entryId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setEntries((currentEntries) =>
          currentEntries.filter((entry) => entry.id !== entryId),
        );
      }
    } finally {
      setDeletingEntryId(null);
    }
  }

  const isToday = selectedDate === today;
  const totalCalories = sumNumbers(entries.map((entry) => entry.calories));
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <FoodForm onLogCreated={handleLogCreated} />

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            {isToday
              ? "Today's entries"
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
              aria-label="View food logs for date"
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
            {totalCalories} calories
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading entries...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No food logged {isToday ? 'today' : 'on this date'}.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Utensils className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        P: {entry.protein}g · C: {entry.carbs}g · F: {entry.fat}
                        g · Sat: {entry.saturatedFat}g
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
