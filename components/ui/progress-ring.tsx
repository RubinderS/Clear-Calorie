import type {ReactNode} from 'react';
import {cn} from '@/lib/utils';
import {Decimal} from '@/lib/decimal';

interface ProgressRingProps {
  value: number;
  strokeWidth?: number;
  className?: string;
  indicatorClassName?: string;
  children?: ReactNode;
}

export function ProgressRing({
  value,
  strokeWidth = 7,
  className,
  indicatorClassName,
  children,
}: ProgressRingProps) {
  const clamped = Decimal.min(100, Decimal.max(0, value)).toNumber();
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn('relative size-24 shrink-0', className)}>
      <svg
        viewBox="0 0 100 100"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted"
        />
        {/* A round linecap would still draw a dot at 0%. */}
        {clamped > 0 && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            className={cn('transition-all', indicatorClassName)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
