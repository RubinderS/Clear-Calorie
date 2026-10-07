'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Rectangle,
  type RectangleProps,
  type TooltipProps,
} from 'recharts';
import {exerciseColors} from '@/lib/chart-colors';

export interface ExerciseChartDatum {
  date: string;
  done: number;
  missed: number;
  extra: number;
  isToday: boolean;
}

const SERIES = [
  {key: 'done', label: 'Done'},
  {key: 'missed', label: 'Missed'},
  {key: 'extra', label: 'Extra'},
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

/** The highest non-empty segment of a day's stack, which gets the rounded top. */
function topSegment(datum: ExerciseChartDatum): SeriesKey | undefined {
  return [...SERIES].reverse().find(({key}) => datum[key] > 0)?.key;
}

function segmentShape(key: SeriesKey) {
  function Segment(shapeProps: unknown) {
    const props = shapeProps as RectangleProps & {
      payload?: ExerciseChartDatum;
    };
    const isTop = props.payload && topSegment(props.payload) === key;
    return (
      <Rectangle
        {...props}
        radius={isTop ? [8, 8, 0, 0] : 0}
        // Card-colored stroke leaves a gap between stacked segments.
        stroke="hsl(var(--card))"
        strokeWidth={2}
      />
    );
  }
  return Segment;
}

const segmentShapes = {
  done: segmentShape('done'),
  missed: segmentShape('missed'),
  extra: segmentShape('extra'),
};

function ExerciseTooltip({active, payload}: TooltipProps<number, string>) {
  const datum = payload?.[0]?.payload as ExerciseChartDatum | undefined;
  if (!active || !datum) return null;

  const planned = datum.done + datum.missed;
  const lines: string[] = [];
  if (planned > 0) {
    const percent = Math.round((datum.done / planned) * 100);
    lines.push(`${datum.done} of ${planned} planned done (${percent}%)`);
    if (datum.missed > 0) {
      lines.push(`${datum.missed} ${datum.isToday ? 'remaining' : 'missed'}`);
    }
  } else {
    lines.push('Rest day');
  }
  if (datum.extra > 0) lines.push(`${datum.extra} extra`);

  return (
    <div className="rounded-xl border bg-card px-3 py-2 text-sm text-card-foreground shadow-md">
      <p className="font-medium">{datum.isToday ? 'Today' : datum.date}</p>
      {lines.map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

export function ExerciseChart({data}: {data: ExerciseChartDatum[]}) {
  const isEmpty = data.every(
    (datum) => datum.done + datum.missed + datum.extra === 0,
  );
  if (isEmpty) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        No exercise planned or logged this week
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{top: 8, right: 8, left: -20, bottom: 0}}>
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{fill: 'hsl(var(--muted) / 30%)'}}
            content={<ExerciseTooltip />}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
          {SERIES.map(({key, label}) => (
            <Bar
              key={key}
              dataKey={key}
              name={label}
              stackId="exercise"
              fill={exerciseColors[key]}
              shape={segmentShapes[key]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
