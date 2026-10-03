'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface WeightChartProps {
  data: {date: string; weight: number}[];
}

// Minimum visible range on the Y axis so small day-to-day fluctuations
// don't get stretched into dramatic swings.
const MIN_Y_SPAN = 10;

function getYDomain(data: WeightChartProps['data']): [number, number] {
  const weights = data.map((d) => d.weight).filter(Number.isFinite);
  if (weights.length === 0) return [0, MIN_Y_SPAN];

  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const padding = (max - min) * 0.1;
  const span = Math.max(max - min + padding * 2, MIN_Y_SPAN);
  const mid = (min + max) / 2;

  const lower = Math.max(0, Math.floor(mid - span / 2));
  const upper = Math.ceil(lower + span);
  return [lower, upper];
}

export function WeightChart({data}: WeightChartProps) {
  const yDomain = getYDomain(data);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{top: 8, right: 8, left: -20, bottom: 0}}
        >
          <defs>
            <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
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
            domain={yDomain}
            allowDecimals={false}
            tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{stroke: 'hsl(var(--muted))', strokeWidth: 1}}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '0.75rem',
              color: 'hsl(var(--foreground))',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            fill="url(#weightGradient)"
            dot={{r: 4, strokeWidth: 2, fill: 'hsl(var(--card))'}}
            activeDot={{r: 6}}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
