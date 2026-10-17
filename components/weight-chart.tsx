'use client';

import {TrendChart} from '@/components/trend-chart';

interface WeightChartProps {
  data: {date: string; weight: number}[];
}

export function WeightChart({data}: WeightChartProps) {
  return (
    <TrendChart
      data={data.map(({date, weight}) => ({date, value: weight}))}
      minSpan={10}
      name="weight"
    />
  );
}
