'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowLeftRight, Undo2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Select} from '@/components/ui/select';
import {WEEKDAYS} from '@/lib/exercise';
import type {WeekSwapDay} from '@/lib/exercise-plan';
import {cn} from '@/lib/utils';

export type WeekSwapOverview = {todayWeekday: number; days: WeekSwapDay[]};

const SWAP_URL = '/api/exercise-goals/swap';

export function weekdayName(day: number): string {
  return WEEKDAYS.find((weekday) => weekday.day === day)?.name ?? '';
}

function weekdayLabel(day: number): string {
  return WEEKDAYS.find((weekday) => weekday.day === day)?.label ?? '';
}

/**
 * "Leg day · Squats, Lunges", "Squats, Push-ups" when the day has no clear
 * focus, or "Rest day", for a day in the picker.
 */
export function daySummary(day: WeekSwapDay): string {
  if (day.exercises.length === 0) return 'Rest day';
  const names =
    day.exercises.length <= 2
      ? day.exercises.join(', ')
      : `${day.exercises.slice(0, 2).join(', ')} +${day.exercises.length - 2}`;
  return day.focus ? `${day.focus} · ${names}` : names;
}

/** This week's swap overview, and the calls that change it. */
export function useWeekSwaps() {
  const router = useRouter();
  const [overview, setOverview] = useState<WeekSwapOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(SWAP_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setOverview(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(init: RequestInit, failure: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(SWAP_URL, init);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? failure);
        return false;
      }
      setOverview(data);
      router.refresh();
      return true;
    } catch {
      setError(failure);
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    overview,
    pending,
    error,
    swap: (a: number, b: number) =>
      send(
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({a, b}),
        },
        'Failed to swap days',
      ),
    reset: () => send({method: 'DELETE'}, 'Failed to reset swaps'),
  };
}

/**
 * Swaps today's workout with a later day's, for this week only: e.g. doing
 * Thursday's workout today and today's cardio or rest on Thursday.
 */
export function DaySwapControl({className}: {className?: string}) {
  const {overview, pending, error, swap} = useWeekSwaps();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');

  if (!overview) return null;
  const today = overview.days.find((day) => day.weekday === overview.todayWeekday);
  if (!today) return null;
  const swapped = today.plannedWeekday !== today.weekday;
  // The day now doing today's own workout, which can give it back.
  const holder = overview.days.find(
    (day) => day.plannedWeekday === today.weekday && day.weekday !== today.weekday,
  );
  const options = overview.days.filter(
    (day) => day.swappable && day.weekday !== today.weekday,
  );
  if (!swapped && (!today.swappable || options.length === 0)) return null;

  return (
    <div className={cn('space-y-2 text-sm', className)} data-day-swap>
      {swapped && (
        <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
          <span>Doing {weekdayName(today.plannedWeekday)}&apos;s workout today</span>
          {today.swappable && holder?.swappable && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              disabled={pending}
              onClick={() => void swap(today.weekday, holder.weekday)}
            >
              <Undo2 />
              Undo
            </Button>
          )}
        </p>
      )}
      {!swapped && !open && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setTarget(String(options[0].weekday));
            setOpen(true);
          }}
        >
          <ArrowLeftRight />
          Swap day
        </Button>
      )}
      {!swapped && open && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void swap(today.weekday, Number(target)).then((done) => {
              if (done) setOpen(false);
            });
          }}
        >
          <label htmlFor="day-swap-target" className="text-muted-foreground">
            Swap today with
          </label>
          <Select
            id="day-swap-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            wrapperClassName="min-w-48 flex-1"
            className="h-9"
          >
            {options.map((day) => (
              <option key={day.weekday} value={day.weekday}>
                {weekdayLabel(day.weekday)} · {daySummary(day)}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" disabled={pending}>
            Swap
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            This week only. Next week follows your plan again.
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
