import {z} from 'zod';

// Optional body measurements beyond weight. Presets give common ones a stable
// key so reports and the AI know what they mean; users can also add their own
// label and unit. Kept free of Prisma so client components can import it.

export const METRIC_DIRECTIONS = ['down', 'up', 'neutral'] as const;
/** Which way is good: "down" = lower is better. */
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<MetricDirection, string> = {
  down: 'Lower is better',
  up: 'Higher is better',
  neutral: 'Neither',
};

type Preset = {
  label: string;
  /** First is the default. */
  units: readonly string[];
  direction: MetricDirection;
  decimals: number;
  min: number;
  max: number;
};

const LENGTH = {units: ['cm', 'in'], decimals: 1, min: 1, max: 300} as const;

export const BODY_METRIC_PRESETS = {
  body_fat: {
    label: 'Body fat',
    units: ['%'],
    direction: 'down',
    decimals: 1,
    min: 1,
    max: 75,
  },
  muscle_mass: {
    label: 'Muscle mass',
    units: ['%', 'kg', 'lb'],
    direction: 'up',
    decimals: 1,
    min: 1,
    max: 400,
  },
  waist: {label: 'Waist', direction: 'down', ...LENGTH},
  hips: {label: 'Hips', direction: 'neutral', ...LENGTH},
  chest: {label: 'Chest', direction: 'neutral', ...LENGTH},
  visceral_fat: {
    label: 'Visceral fat',
    units: ['level'],
    direction: 'down',
    decimals: 0,
    min: 1,
    max: 60,
  },
  resting_hr: {
    label: 'Resting heart rate',
    units: ['bpm'],
    direction: 'down',
    decimals: 0,
    min: 20,
    max: 250,
  },
} as const satisfies Record<string, Preset>;

export type BodyMetricPresetKey = keyof typeof BODY_METRIC_PRESETS;

export function isPresetKey(key: unknown): key is BodyMetricPresetKey {
  return typeof key === 'string' && Object.hasOwn(BODY_METRIC_PRESETS, key);
}

/** The BodyMetric fields the UI needs. */
export type TrackedMetric = {
  id: string;
  key: string | null;
  label: string;
  unit: string;
  direction: string;
  decimals: number;
};

/** Just the TrackedMetric fields, e.g. without logs, for client components. */
export function toTrackedMetric(metric: TrackedMetric): TrackedMetric {
  const {id, key, label, unit, direction, decimals} = metric;
  return {id, key, label, unit, direction, decimals};
}

/** Prisma `select` for a TrackedMetric. */
export const TRACKED_METRIC_SELECT = {
  id: true,
  key: true,
  label: true,
  unit: true,
  direction: true,
  decimals: true,
} as const;

/** Display order for a user's metrics. */
export const METRIC_ORDER = [
  {sortOrder: 'asc'},
  {createdAt: 'asc'},
] as const;

/** Input step for a metric, e.g. "0.1" for one decimal. */
export function metricStep(decimals: number) {
  return decimals > 0 ? (1 / 10 ** decimals).toFixed(decimals) : '1';
}

/** Active metrics a user can track at once. */
export const MAX_ACTIVE_METRICS = 15;
/** Upper bound for custom metric values, which have no preset range. */
const CUSTOM_MAX = 100_000;

const presetSchema = z.object({key: z.string(), unit: z.string().optional()}).strict();
const customSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    unit: z.string().trim().min(1).max(12),
    direction: z.enum(METRIC_DIRECTIONS),
  })
  .strict();

/** Fields for a new BodyMetric row, from a create request. */
export type MetricDefinition = {
  key: BodyMetricPresetKey | null;
  label: string;
  unit: string;
  direction: MetricDirection;
  decimals: number;
};

/**
 * Parses a request to track a preset (`{key, unit?}`) or a custom metric
 * (`{label, unit, direction}`). Null when invalid, including a unit the preset
 * doesn't offer.
 */
export function parseMetricDefinition(body: unknown): MetricDefinition | null {
  const preset = presetSchema.safeParse(body);
  if (preset.success) {
    const {key, unit} = preset.data;
    if (!isPresetKey(key)) return null;
    const def: Preset = BODY_METRIC_PRESETS[key];
    const chosen = unit ?? def.units[0];
    if (!def.units.includes(chosen)) return null;
    return {key, label: def.label, unit: chosen, direction: def.direction, decimals: def.decimals};
  }

  const custom = customSchema.safeParse(body);
  if (!custom.success) return null;
  return {key: null, ...custom.data, decimals: 1};
}

export const metricLogSchema = z.object({
  entries: z
    .array(z.object({metricId: z.string().min(1), value: z.number()}))
    .min(1)
    .max(MAX_ACTIVE_METRICS)
    .refine(
      (entries) => new Set(entries.map((e) => e.metricId)).size === entries.length,
      'Each metric can be logged once per entry',
    ),
});

/** The range a metric's values must fall in. */
export function metricRange(metric: {key: string | null}): {min: number; max: number} {
  if (isPresetKey(metric.key)) {
    const {min, max} = BODY_METRIC_PRESETS[metric.key];
    return {min, max};
  }
  return {min: 0, max: CUSTOM_MAX};
}

export function isValidMetricValue(metric: {key: string | null}, value: number) {
  const {min, max} = metricRange(metric);
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Rounds to the metric's decimals, dropping trailing zeros. */
export function roundMetricValue(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

export function formatMetricValue(
  value: number,
  metric: {unit: string; decimals: number},
) {
  const rounded = roundMetricValue(value, metric.decimals);
  return metric.unit === '%' ? `${rounded}%` : `${rounded} ${metric.unit}`;
}

/** Signed change with the metric's unit, e.g. "-1.5 cm". */
export function formatMetricChange(
  change: number,
  metric: {unit: string; decimals: number},
) {
  const sign = change > 0 ? '+' : '';
  return `${sign}${formatMetricValue(change, metric)}`;
}

/** Whether a change is good, bad or neither, given the metric's direction. */
export function changeTone(
  change: number,
  direction: string,
): 'good' | 'bad' | 'neutral' {
  if (change === 0 || direction === 'neutral') return 'neutral';
  const better = direction === 'down' ? change < 0 : change > 0;
  return better ? 'good' : 'bad';
}

/**
 * Minimum visible Y-axis span for a metric's chart, so small fluctuations
 * aren't stretched into dramatic swings. Weight uses 10.
 */
export function chartMinSpan(unit: string) {
  switch (unit) {
    case 'kg':
    case 'lb':
    case 'bpm':
      return 10;
    case '%':
    case 'cm':
      return 5;
    case 'in':
      return 2;
    default:
      return 1;
  }
}
