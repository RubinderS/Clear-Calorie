import {format} from 'date-fns';
import {toZoned} from '@/lib/timezone';
import {
  changeTone,
  formatMetricChange,
  metricChange,
  rollingAverages,
  roundMetricValue,
  TREND_WEEKS,
  weeklyAverages,
  type WeeklyAverage,
} from '@/lib/body-metrics';
import {cn} from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {TrendChart} from '@/components/trend-chart';
import {changeToneClass, RollingAverage} from '@/components/rolling-average';
import {MeasurementViews} from '@/components/measurement-views';
import {WeightDeleteButton} from '@/components/weight-delete-button';
import {AddLogButton} from '@/components/quick-log';
import type {TrackedMetric} from '@/lib/body-metrics';

/** Entries visible before the list scrolls. */
const VISIBLE_ENTRIES = 5;

type MeasurementCardProps = {
  title: string;
  /** Shown after the title, e.g. "cm". */
  unit?: string;
  /** Newest first. */
  entries: {id: string; value: number; loggedAt: Date}[];
  /** Every entry from the last TREND_WEEKS weeks, for the averages. */
  history: {value: number; loggedAt: Date}[];
  timeZone: string;
  /** Start of today in the user's timezone; the same one `history` was fetched for. */
  todayStart: Date;
  formatValue: (value: number) => string;
  /** Decimals shown in the 7-day average. */
  decimals: number;
  /** Which way is good, for colouring the average's change. */
  direction?: string;
  /** Y-axis span for the chart; see TrendChart. */
  minSpan: number;
  /** API route that deletes an entry by `?id=`. */
  deleteEndpoint: string;
  /** What an entry is called in delete prompts, e.g. "weight entry". */
  entryName: string;
  emptyText: string;
  /** Every active metric; the dialog picks out `field`. */
  bodyMetrics: TrackedMetric[];
  /** The field the add dialog shows: 'weight' or this metric's id. */
  field: string;
};

/**
 * Trend chart over a list of entries, the same for weight and every body
 * measurement. The list shows five entries and scrolls for the rest.
 */
export function MeasurementCard({
  title,
  unit,
  entries,
  history,
  timeZone,
  todayStart,
  formatValue,
  decimals,
  direction,
  minSpan,
  deleteEndpoint,
  entryName,
  emptyText,
  bodyMetrics,
  field,
}: MeasurementCardProps) {
  const day = (date: Date, pattern: string) =>
    format(toZoned(date, timeZone), pattern);
  const chartData = entries
    .slice()
    .reverse()
    .map((entry) => ({date: day(entry.loggedAt, 'MMM dd'), value: entry.value}));
  const scrolls = entries.length > VISIBLE_ENTRIES;
  // Like the food and exercise logs, only today's entries can be deleted.
  const today = day(todayStart, 'yyyy-MM-dd');
  const {avg, prevAvg} = rollingAverages(history, todayStart);
  const weeks = weeklyAverages(history, todayStart);
  const metric = {unit: unit ?? '', decimals};

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>
            {title}
            {unit && (
              <>
                {' '}
                <span className="text-base font-normal text-muted-foreground">
                  ({unit})
                </span>
              </>
            )}
          </CardTitle>
          {avg !== null && (
            <CardDescription>
              <RollingAverage
                avg={avg}
                prevAvg={prevAvg}
                unit={unit ?? ''}
                decimals={decimals}
                direction={direction}
              />
            </CardDescription>
          )}
        </div>
        <AddLogButton
          panel="body"
          label={`Add ${title.toLowerCase()}`}
          bodyMetrics={bodyMetrics}
          bodyField={field}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <MeasurementViews
            title={title}
            entries={
              <>
                <TrendChart
                  data={chartData}
                  minSpan={minSpan}
                  unit={unit}
                  name={title.toLowerCase()}
                  className="h-56"
                />
                {/* Five rows of h-12 plus gaps, with part of the sixth showing so
                    it's clear the list scrolls. */}
                <div
                  className={scrolls ? 'max-h-[19rem] overflow-y-auto pr-1' : undefined}
                  tabIndex={scrolls ? 0 : undefined}
                  role={scrolls ? 'region' : undefined}
                  aria-label={scrolls ? `${title} entries` : undefined}
                >
                  <ul className="space-y-2">
                    {entries.map((entry) => {
                      const date = day(entry.loggedAt, 'MMM dd, yyyy');
                      return (
                        <li
                          key={entry.id}
                          className="flex h-12 items-center justify-between rounded-xl border border-border/50 bg-muted/30 pl-4 pr-1 transition-colors hover:bg-muted/50"
                        >
                          <p className="font-semibold">{formatValue(entry.value)}</p>
                          <div className="flex items-center gap-2">
                            <time
                              dateTime={entry.loggedAt.toISOString()}
                              className="text-right leading-tight"
                            >
                              <span className="block text-sm text-muted-foreground">
                                {date}
                              </span>
                              <span className="block text-xs text-muted-foreground/70">
                                {day(entry.loggedAt, 'h:mm a')}
                              </span>
                            </time>
                            <WeightDeleteButton
                              entryId={entry.id}
                              endpoint={deleteEndpoint}
                              label={`${entryName} from ${date}`}
                              disabled={day(entry.loggedAt, 'yyyy-MM-dd') !== today}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            }
            weekly={
              <WeeklyTrend
                weeks={weeks}
                title={title}
                timeZone={timeZone}
                formatValue={formatValue}
                metric={metric}
                direction={direction}
                minSpan={minSpan}
              />
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

/** "Nov 17 – 23", or "Oct 27 – Nov 2" across months. */
function rangeLabel(start: Date, end: Date, timeZone: string) {
  const zonedStart = toZoned(start, timeZone);
  const zonedEnd = toZoned(end, timeZone);
  const sameMonth = format(zonedStart, 'yyyy-MM') === format(zonedEnd, 'yyyy-MM');
  return `${format(zonedStart, 'MMM d')} – ${format(zonedEnd, sameMonth ? 'd' : 'MMM d')}`;
}

/**
 * Average of each seven days back from today, with its change from the seven
 * days before, over a chart of those averages.
 */
function WeeklyTrend({
  weeks,
  title,
  timeZone,
  formatValue,
  metric,
  direction = 'neutral',
  minSpan,
}: {
  /** Newest first. */
  weeks: WeeklyAverage[];
  title: string;
  timeZone: string;
  formatValue: (value: number) => string;
  metric: {unit: string; decimals: number};
  direction?: string;
  minSpan: number;
}) {
  if (weeks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing logged in the last {TREND_WEEKS} weeks.
      </p>
    );
  }
  // Empty weeks stay in as gaps, so the line breaks instead of joining
  // weeks that weren't next to each other.
  const chartData = weeks
    .slice()
    .reverse()
    .map((week) => ({
      // Each point is the seven days up to its date, so the newest is today.
      date: format(toZoned(week.end, timeZone), 'MMM dd'),
      value: week.avg === null ? null : roundMetricValue(week.avg, metric.decimals),
    }));
  const scrolls = weeks.length > VISIBLE_ENTRIES;

  return (
    <>
      <TrendChart
        data={chartData}
        minSpan={minSpan}
        unit={metric.unit || undefined}
        name={`7-day avg ${title.toLowerCase()}`}
        className="h-56"
      />
      <div
        className={scrolls ? 'max-h-[19rem] overflow-y-auto pr-1' : undefined}
        tabIndex={scrolls ? 0 : undefined}
        role={scrolls ? 'region' : undefined}
        aria-label={scrolls ? `${title} weekly averages` : undefined}
      >
        <ul className="space-y-2">
          {weeks.map((week, i) => {
            // Compare with the nearest earlier week that has entries, naming
            // it when it isn't the one just before.
            const baseline = weeks.slice(i + 1).find((other) => other.avg !== null);
            const change = metricChange(week.avg, baseline?.avg ?? null, metric.decimals);
            const tone = change === null ? 'neutral' : changeTone(change, direction);
            const adjacent = baseline === weeks[i + 1];
            return (
              <li
                key={week.start.toISOString()}
                className="flex h-12 items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 transition-colors hover:bg-muted/50"
              >
                <div className="leading-tight">
                  <p className="font-semibold tabular-nums">
                    {week.avg === null ? (
                      <span className="font-normal text-muted-foreground">No entries</span>
                    ) : (
                      formatValue(roundMetricValue(week.avg, metric.decimals))
                    )}
                  </p>
                  {change !== null && (
                    <p className={cn('text-xs tabular-nums', changeToneClass(tone))}>
                      {change === 0
                        ? 'No change'
                        : formatMetricChange(change, metric)}
                      {adjacent || !baseline ? (
                        <span className="sr-only"> vs prior 7 days</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {' '}
                          vs {rangeLabel(baseline.start, baseline.end, timeZone)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right leading-tight">
                  <span className="block text-sm text-muted-foreground">
                    {rangeLabel(week.start, week.end, timeZone)}
                  </span>
                  <span className="block text-xs text-muted-foreground/70">
                    {week.count} {week.count === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
