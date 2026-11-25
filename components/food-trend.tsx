'use client';

import {useId, useState} from 'react';
import {format, parseISO} from 'date-fns';
import {formatMetricChange, formatMetricValue, metricChange, TREND_WEEKS} from '@/lib/body-metrics';
import {macroColors} from '@/lib/chart-colors';
import {roundNumber} from '@/lib/decimal';
import {FOOD_NUTRIENTS, type FoodWeek, type Nutrient} from '@/lib/food-trend';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Toggler} from '@/components/ui/toggler';
import {TrendChart} from '@/components/trend-chart';

const CALORIES = {unit: 'kcal', decimals: 0};
const MACROS = FOOD_NUTRIENTS.filter(({key}) => key !== 'calories');
/** The dashboard's macro colours; calories keep the theme's primary. */
const CHART_COLORS: Partial<Record<Nutrient, string>> = {
  protein: macroColors.Protein,
  carbs: macroColors.Carbs,
  fat: macroColors.Fat,
  saturatedFat: macroColors['Saturated Fat'],
};
const CHART_OPTIONS = FOOD_NUTRIENTS.map(({key, label}) => ({
  value: key,
  label,
  color: CHART_COLORS[key],
  // White text is too faint on fat's amber.
  textColor: key === 'fat' ? '#1c1917' : undefined,
}));
/** Rows shown before the list scrolls, as on the body cards. */
const VISIBLE_WEEKS = 5;

/** "Nov 17 – 23", or "Oct 27 – Nov 2" across months. */
function rangeLabel(start: string, end: string) {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), sameMonth ? 'd' : 'MMM d')}`;
}

/**
 * Average daily calories and macros over each seven days before today, with
 * the calorie change from the seven days before, over a chart of one nutrient.
 */
export function FoodTrend({weeks}: {/** Newest first. */ weeks: FoodWeek[]}) {
  const [nutrient, setNutrient] = useState<Nutrient>('calories');
  const name = useId();
  const chartNutrient = FOOD_NUTRIENTS.find(({key}) => key === nutrient)!;
  // Empty weeks stay in as gaps, so the line breaks instead of joining weeks
  // that weren't next to each other.
  const chartData = weeks
    .slice()
    .reverse()
    .map((week) => ({
      // Each point is the seven days up to its date.
      date: format(parseISO(week.end), 'MMM dd'),
      value: week.avg === null ? null : roundNumber(week.avg[nutrient]),
    }));
  const scrolls = weeks.length > VISIBLE_WEEKS;

  return (
    <Card>
      <CardHeader>
        <CardTitle>7-day averages</CardTitle>
        <CardDescription>
          Daily totals averaged over each 7 days, counting only days with food
          logged. Today is left out until it&apos;s over.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing logged in the {TREND_WEEKS} weeks before today.
          </p>
        ) : (
          <>
            <Toggler
              name={name}
              label="Chart nutrient"
              options={CHART_OPTIONS}
              value={nutrient}
              onChange={setNutrient}
              // Tighter padding on phones so "Sat fat" fits on one line.
              className="h-9 w-full sm:w-[28rem] max-sm:[&_span]:px-1"
            />
            <TrendChart
              data={chartData}
              minSpan={chartNutrient.minSpan}
              unit={chartNutrient.unit}
              name={`7-day avg ${chartNutrient.label.toLowerCase()}`}
              color={CHART_COLORS[nutrient]}
              className="h-56"
            />
            {/* Five rows plus part of the sixth, so it's clear the list scrolls. */}
            <div
              className={scrolls ? 'max-h-[22rem] overflow-y-auto pr-1' : undefined}
              tabIndex={scrolls ? 0 : undefined}
              role={scrolls ? 'region' : undefined}
              aria-label={scrolls ? 'Food weekly averages' : undefined}
            >
              <ul className="space-y-2">
                {weeks.map((week, i) => {
                  // Compare with the nearest earlier week that has entries,
                  // naming it when it isn't the one just before.
                  const baseline = weeks.slice(i + 1).find((other) => other.avg !== null);
                  const change = metricChange(
                    week.avg?.calories ?? null,
                    baseline?.avg?.calories ?? null,
                    CALORIES.decimals,
                  );
                  const adjacent = baseline === weeks[i + 1];
                  return (
                    <li
                      key={week.start}
                      className="space-y-0.5 rounded-xl border border-border/50 bg-muted/30 px-4 py-2 leading-tight transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        {week.avg === null ? (
                          <p className="text-muted-foreground">No entries</p>
                        ) : (
                          <p className="min-w-0 tabular-nums">
                            <span className="font-semibold">
                              {formatMetricValue(week.avg.calories, CALORIES)}
                            </span>
                            {change !== null && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {change === 0 ? 'No change' : formatMetricChange(change, CALORIES)}
                                {adjacent || !baseline ? (
                                  <span className="sr-only"> vs prior 7 days</span>
                                ) : (
                                  <> vs {rangeLabel(baseline.start, baseline.end)}</>
                                )}
                              </span>
                            )}
                          </p>
                        )}
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {rangeLabel(week.start, week.end)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <p className="min-w-0 text-muted-foreground tabular-nums">
                          {week.avg &&
                            MACROS.map(({key, short}) => `${short} ${roundNumber(week.avg![key])}g`).join(
                              ' · ',
                            )}
                        </p>
                        <span className="shrink-0 text-muted-foreground/70">
                          {week.days} {week.days === 1 ? 'day' : 'days'}
                          <span className="max-sm:hidden"> logged</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
