import {cookies} from 'next/headers';
import {startOfDay, endOfDay} from 'date-fns';
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

/** Reads the browser-detected IANA timezone cookie, falling back to UTC for missing/invalid values. */
export async function getUserTimeZone(): Promise<string> {
  const cookieStore = await cookies();
  const value = cookieStore.get(TIMEZONE_COOKIE)?.value;
  return value && isValidTimeZone(value) ? value : DEFAULT_TIMEZONE;
}

/** Start/end of "today" as real UTC instants, computed in the given IANA timezone. */
export function getTodayRange(timeZone: string): {start: Date; end: Date} {
  const now = TZDate.tz(timeZone);
  return {start: startOfDay(now), end: endOfDay(now)};
}

/** Wraps a stored (UTC) Date so date-fns reads its fields in the given timezone. */
export function toZoned(date: Date, timeZone: string): TZDate {
  return new TZDate(date, timeZone);
}
