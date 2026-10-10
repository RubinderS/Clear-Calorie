// Mirrors lib/timezone.ts, which can't be imported here because it reads
// cookies through next/headers.
import {TZDate} from '@date-fns/tz';
import {addDays, format, parseISO} from 'date-fns';

/** Today's yyyy-MM-dd in the given IANA timezone. */
export function todayIn(timeZone = 'UTC'): string {
  return format(TZDate.tz(timeZone), 'yyyy-MM-dd');
}

/** Today's weekday in the timezone, matching Date#getDay() (0 = Sunday). */
export function weekdayIn(timeZone = 'UTC'): number {
  return TZDate.tz(timeZone).getDay();
}

/** yyyy-MM-dd shifted by whole days. */
export function shiftDate(date: string, days: number): string {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

export function daysAgoIn(days: number, timeZone = 'UTC'): string {
  return shiftDate(todayIn(timeZone), -days);
}

/** The real instant of a wall-clock time on a yyyy-MM-dd date in the timezone. */
export function instantAt(
  date: string,
  time: string,
  timeZone = 'UTC',
): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(
    new TZDate(year, month - 1, day, hours, minutes, timeZone).getTime(),
  );
}

/** Noon on a past day, safely inside that day in the timezone. */
export function noonDaysAgo(days: number, timeZone = 'UTC'): Date {
  return instantAt(daysAgoIn(days, timeZone), '12:00', timeZone);
}

/** "MMM dd" as the dashboard charts label days. */
export function chartLabel(date: string): string {
  return format(parseISO(date), 'MMM dd');
}

/** "MMMM d, yyyy" as the Logs page titles past days. */
export function longDate(date: string): string {
  return format(parseISO(date), 'MMMM d, yyyy');
}
