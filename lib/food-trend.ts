import {format, parseISO, subDays} from 'date-fns';
import {averageNumbers, sumNumbers} from './decimal';
import {ROLLING_AVERAGE_DAYS, TREND_WEEKS} from './body-metrics';

// Weekly averages of what was eaten, for the food log's 7-day trend. Kept free
// of the database so client components can import it.

export const FOOD_NUTRIENTS = [
  {key: 'calories', label: 'Calories', short: 'Cal', unit: 'kcal', minSpan: 500},
  {key: 'protein', label: 'Protein', short: 'P', unit: 'g', minSpan: 50},
  {key: 'carbs', label: 'Carbs', short: 'C', unit: 'g', minSpan: 50},
  {key: 'fat', label: 'Fat', short: 'F', unit: 'g', minSpan: 30},
  {key: 'saturatedFat', label: 'Sat fat', short: 'Sat', unit: 'g', minSpan: 10},
] as const;

export type Nutrient = (typeof FOOD_NUTRIENTS)[number]['key'];
export type Nutrients = Record<Nutrient, number>;

export type FoodWeek = {
  /** First day of the window, user-local yyyy-MM-dd. */
  start: string;
  /** Last day of the window; yesterday for the newest. */
  end: string;
  /** Days in the window with anything logged. */
  days: number;
  /** Average daily totals over those days; null when none were logged. */
  avg: Nutrients | null;
};

const shift = (date: string, days: number) =>
  format(subDays(parseISO(date), days), 'yyyy-MM-dd');

/**
 * Back-to-back seven-day windows of average daily totals, newest first: the
 * seven days before `today`, then the seven before those, and so on, so the
 * newest matches dailyRollingAverages. Today is left out since it's still
 * being logged, and only days with entries count: a day with nothing logged
 * wasn't tracked, not zero. Empty windows older than the oldest entry are left
 * out. Dates are user-local yyyy-MM-dd.
 */
export function foodWeeklyAverages(
  entries: (Nutrients & {date: string})[],
  today: string,
  weeks = TREND_WEEKS,
): FoodWeek[] {
  const windows = Array.from({length: weeks}, (_, i) => ({
    start: shift(today, ROLLING_AVERAGE_DAYS * (i + 1)),
    end: shift(today, ROLLING_AVERAGE_DAYS * i + 1),
  }));
  const oldest = windows[windows.length - 1]?.start ?? today;

  const days = new Map<string, (Nutrients & {date: string})[]>();
  for (const entry of entries) {
    if (entry.date < oldest || entry.date >= today) continue;
    days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
  }

  const result = windows.map(({start, end}) => {
    const totals = [...days]
      .filter(([date]) => date >= start && date <= end)
      .map(([, dayEntries]) => dayEntries);
    const avg =
      totals.length === 0
        ? null
        : (Object.fromEntries(
            FOOD_NUTRIENTS.map(({key}) => [
              key,
              averageNumbers(totals.map((day) => sumNumbers(day.map((e) => e[key])))),
            ]),
          ) as Nutrients);
    return {start, end, days: totals.length, avg};
  });

  let last = result.length - 1;
  while (last >= 0 && result[last].avg === null) last--;
  return result.slice(0, last + 1);
}
