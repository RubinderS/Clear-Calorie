'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {macroColors} from '@/lib/chart-colors';

interface MacrosChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  color?: string;
}

export function MacrosChart({data, dataKey, color}: MacrosChartProps) {
  const colorFromData =
    data.length > 0 && typeof data[0].name === 'string'
      ? (macroColors[data[0].name] ?? undefined)
      : undefined;
  const resolvedColor = color ?? colorFromData;

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
            dataKey="name"
            tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{fill: 'hsl(var(--muted) / 30%)'}}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '0.75rem',
              color: 'hsl(var(--foreground))',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          />
          <Bar
            dataKey={dataKey}
            fill={resolvedColor ?? 'hsl(var(--primary))'}
            radius={[8, 8, 0, 0]}
          >
            {data.map((entry, index) => {
              const name = typeof entry.name === 'string' ? entry.name : '';
              const fill = color ?? macroColors[name] ?? 'hsl(var(--primary))';
              return <Cell key={`cell-${index}`} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
