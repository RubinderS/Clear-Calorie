import {cn} from '@/lib/utils';
import {
  changeTone,
  formatMetricChange,
  formatMetricValue,
  roundMetricValue,
} from '@/lib/body-metrics';

type RollingAverageProps = {
  avg: number;
  /** Average of the seven days before; null when there were no entries. */
  prevAvg: number | null;
  unit: string;
  decimals: number;
  /** Which way is good, for colouring the change. */
  direction?: string;
};

/** "7-day avg 84.2 cm · -0.6 cm vs prior 7 days", for a card description. */
export function RollingAverage({
  avg,
  prevAvg,
  unit,
  decimals,
  direction = 'neutral',
}: RollingAverageProps) {
  const metric = {unit, decimals};
  const change =
    prevAvg === null ? null : roundMetricValue(avg - prevAvg, decimals);
  const tone = change === null ? 'neutral' : changeTone(change, direction);

  return (
    <>
      7-day avg{' '}
      <span className="font-medium text-foreground tabular-nums">
        {formatMetricValue(avg, metric)}
      </span>
      {change !== null && (
        <>
          {' · '}
          <span
            className={cn(
              'tabular-nums',
              tone === 'good' && 'text-primary',
              tone === 'bad' && 'text-red-600 dark:text-red-400',
            )}
          >
            {change === 0
              ? 'same as prior 7 days'
              : `${formatMetricChange(change, metric)} vs prior 7 days`}
          </span>
        </>
      )}
    </>
  );
}
