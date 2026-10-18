import {
  chartMinSpan,
  formatMetricValue,
  toTrackedMetric,
  type TrackedMetric,
} from '@/lib/body-metrics';
import {MeasurementCard} from '@/components/measurement-card';

type MetricWithLogs = TrackedMetric & {
  /** Newest first. */
  logs: {id: string; value: number; loggedAt: Date}[];
};

interface BodyMetricLogProps {
  metrics: MetricWithLogs[];
  timeZone: string;
}

/** A card per tracked body metric, laid out like weight. */
export function BodyMetricLog({metrics, timeZone}: BodyMetricLogProps) {
  const bodyMetrics = metrics.map(toTrackedMetric);
  return metrics.map((metric) => (
    <MeasurementCard
      key={metric.id}
      title={metric.label}
      unit={metric.unit}
      entries={metric.logs}
      timeZone={timeZone}
      formatValue={(value) => formatMetricValue(value, metric)}
      minSpan={chartMinSpan(metric.unit)}
      deleteEndpoint="/api/body-metrics/log"
      entryName={`${metric.label.toLowerCase()} entry`}
      emptyText="No entries yet."
      bodyMetrics={bodyMetrics}
      field={metric.id}
    />
  ));
}
