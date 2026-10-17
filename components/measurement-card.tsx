import {format} from 'date-fns';
import {toZoned} from '@/lib/timezone';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {TrendChart} from '@/components/trend-chart';
import {WeightDeleteButton} from '@/components/weight-delete-button';

/** Entries visible before the list scrolls. */
const VISIBLE_ENTRIES = 5;

type MeasurementCardProps = {
  title: string;
  /** Shown after the title, e.g. "cm". */
  unit?: string;
  /** Newest first. */
  entries: {id: string; value: number; loggedAt: Date}[];
  timeZone: string;
  formatValue: (value: number) => string;
  /** Y-axis span for the chart; see TrendChart. */
  minSpan: number;
  /** API route that deletes an entry by `?id=`. */
  deleteEndpoint: string;
  /** What an entry is called in delete prompts, e.g. "weight entry". */
  entryName: string;
  emptyText: string;
};

/**
 * Trend chart over a list of entries, the same for weight and every body
 * measurement. The list shows five entries and scrolls for the rest.
 */
export function MeasurementCard({
  title,
  unit,
  entries,
  timeZone,
  formatValue,
  minSpan,
  deleteEndpoint,
  entryName,
  emptyText,
}: MeasurementCardProps) {
  const day = (date: Date, pattern: string) =>
    format(toZoned(date, timeZone), pattern);
  const chartData = entries
    .slice()
    .reverse()
    .map((entry) => ({date: day(entry.loggedAt, 'MMM dd'), value: entry.value}));
  const scrolls = entries.length > VISIBLE_ENTRIES;

  return (
    <Card>
      <CardHeader>
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
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
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
                        <p className="text-sm text-muted-foreground">{date}</p>
                        <WeightDeleteButton
                          entryId={entry.id}
                          endpoint={deleteEndpoint}
                          label={`${entryName} from ${date}`}
                        />
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
