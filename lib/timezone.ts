import {cookies} from 'next/headers';
import {startOfDay, endOfDay, format} from 'date-fns';
import {TZDate} from '@date-fns/tz';
import {TIMEZONE_COOKIE, DEFAULT_TIMEZONE} from '@/lib/timezone-constants';

export {TIMEZONE_COOKIE, DEFAULT_TIMEZONE};

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, {timeZone});
    return true;
  } catch {
    return false;
  }
}

/** Reads the browser-detected IANA timezone cookie; null when missing or invalid. */
export async function getDetectedTimeZone(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(TIMEZONE_COOKIE)?.value;
  return value && isValidTimeZone(value) ? value : null;
}

/** Reads the browser-detected IANA timezone cookie, falling back to UTC for missing/invalid values. */
export async function getUserTimeZone(): Promise<string> {
  return (await getDetectedTimeZone()) ?? DEFAULT_TIMEZONE;
}

/** Start/end of "today" as real UTC instants, computed in the given IANA timezone. */
export function getTodayRange(timeZone: string): {start: Date; end: Date} {
  const now = TZDate.tz(timeZone);
  return {start: startOfDay(now), end: endOfDay(now)};
}

/** Start/end of a calendar date as real UTC instants in the given IANA timezone. */
export function getDateRange(
  date: string,
  timeZone: string,
): {start: Date; end: Date} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const zonedDate = TZDate.tz(
    timeZone,
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  if (
    zonedDate.getFullYear() !== Number(match[1]) ||
    zonedDate.getMonth() !== Number(match[2]) - 1 ||
    zonedDate.getDate() !== Number(match[3])
  ) {
    return null;
  }

  return {start: startOfDay(zonedDate), end: endOfDay(zonedDate)};
}

/**
 * When an entry for a yyyy-MM-dd date is logged, as a real UTC instant: now
 * for today without a time, else the HH:mm time (midday by default) on that
 * date in the given timezone. Null for an invalid date.
 */
export function getLogTime(
  date: string,
  time: string | undefined,
  timeZone: string,
): Date | null {
  if (!getDateRange(date, timeZone)) return null;
  if (!time && date === getTodayDate(timeZone)) return new Date();
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = (time ?? '12:00').split(':').map(Number);
  return new Date(TZDate.tz(timeZone, year, month - 1, day, hours, minutes).getTime());
}

/** Wraps a stored (UTC) Date so date-fns reads its fields in the given timezone. */
export function toZoned(date: Date, timeZone: string): TZDate {
  return new TZDate(date, timeZone);
}

/** Today's weekday in the given timezone, matching Date#getDay() (0 = Sunday). */
export function getTodayWeekday(timeZone: string): number {
  return TZDate.tz(timeZone).getDay();
}

/** Today's calendar date (yyyy-MM-dd) in the given timezone. */
export function getTodayDate(timeZone: string): string {
  return format(TZDate.tz(timeZone), 'yyyy-MM-dd');
}
