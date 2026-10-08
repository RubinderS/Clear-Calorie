'use client';

import {useEffect, useState, type ReactNode} from 'react';
import {addDays, format, parseISO} from 'date-fns';
import {TZDate} from '@date-fns/tz';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {cn} from '@/lib/utils';

export type DailyLogEntry = {
  id: string;
  name: string;
  calories: number;
  loggedAt: string | Date;
};

type UseDailyLogOptions<T extends DailyLogEntry> = {
  endpoint: string;
  initialEntries: T[];
  today: string;
  onDeleted?: (entry: T) => void;
};

export function useDailyLog<T extends DailyLogEntry>({
  endpoint,
  initialEntries,
  today,
  onDeleted,
}: UseDailyLogOptions<T>) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [entries, setEntries] = useState(initialEntries);
  const [isLoading, setIsLoading] = useState(() => initialEntries.length === 0);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      setIsLoading(true);
      const response = await fetch(`${endpoint}?date=${selectedDate}`);
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
  }, [endpoint, selectedDate, refreshVersion]);

  function showTodayAndRefresh() {
    setSelectedDate(today);
    setRefreshVersion((version) => version + 1);
  }

  async function deleteEntry(entry: T) {
    if (!window.confirm(`Delete ${entry.name}? This cannot be undone.`)) {
      return;
    }

    const {id: entryId} = entry;
    setDeletingEntryId(entryId);
    try {
      const response = await fetch(`${endpoint}?id=${entryId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setEntries((currentEntries) =>
          currentEntries.filter((entry) => entry.id !== entryId),
        );
        onDeleted?.(entry);
      }
    } finally {
      setDeletingEntryId(null);
    }
  }

  function replaceEntry(updated: T) {
    setEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === updated.id ? updated : entry,
      ),
    );
  }

  return {
    today,
    selectedDate,
    setSelectedDate,
    isToday: selectedDate === today,
    entries,
    isLoading,
    deletingEntryId,
    deleteEntry,
    replaceEntry,
    showTodayAndRefresh,
  };
}

export type DailyLog<T extends DailyLogEntry> = ReturnType<
  typeof useDailyLog<T>
>;

function shiftDate(date: string, days: number) {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

type DailyLogCardProps<T extends DailyLogEntry> = {
  log: DailyLog<T>;
  timeZone: string;
  todayTitle: string;
  dateInputLabel: string;
  summary: ReactNode;
  loadingText: string;
  emptyText: string;
  icon: LucideIcon;
  iconClassName: string;
  renderDetail: (entry: T) => ReactNode;
  renderBadge?: (entry: T) => ReactNode;
  onEdit?: (entry: T) => void;
};

export function DailyLogCard<T extends DailyLogEntry>({
  log,
  timeZone,
  todayTitle,
  dateInputLabel,
  summary,
  loadingText,
  emptyText,
  icon: Icon,
  iconClassName,
  renderDetail,
  renderBadge,
  onEdit,
}: DailyLogCardProps<T>) {
  const {
    today,
    selectedDate,
    setSelectedDate,
    isToday,
    entries,
    isLoading,
    deletingEntryId,
    deleteEntry,
  } = log;

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>
          {isToday
            ? todayTitle
            : format(parseISO(selectedDate), 'MMMM d, yyyy')}
        </CardTitle>
        <div className="flex w-full items-center justify-between gap-1 sm:w-auto">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Previous day"
            title="Previous day"
            onClick={() => setSelectedDate((date) => shiftDate(date, -1))}
            className="h-9 w-9 shrink-0"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <input
            aria-label={dateInputLabel}
            type="date"
            value={selectedDate}
            max={today}
            onChange={(event) => {
              if (event.target.value) setSelectedDate(event.target.value);
            }}
            className="h-9 min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next day"
            title="Next day"
            disabled={selectedDate >= today}
            onClick={() => setSelectedDate((date) => shiftDate(date, 1))}
            className="h-9 w-9 shrink-0"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">{summary}</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{loadingText}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyText} {isToday ? 'today' : 'on this date'}.
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex',
                      iconClassName,
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {renderDetail(entry)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="font-semibold">{entry.calories} kcal</p>
                    <p className="text-xs text-muted-foreground">
                      {format(
                        new TZDate(new Date(entry.loggedAt), timeZone),
                        'h:mm a',
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 sm:flex-row">
                    {renderBadge?.(entry)}
                    {onEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${entry.name}`}
                        title={`Edit ${entry.name}`}
                        disabled={!isToday}
                        onClick={() => onEdit(entry)}
                        className="text-muted-foreground"
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${entry.name}`}
                      title={`Delete ${entry.name}`}
                      disabled={!isToday || deletingEntryId === entry.id}
                      onClick={() => void deleteEntry(entry)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-500/30 dark:hover:text-red-200"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
