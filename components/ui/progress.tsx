import {cn} from '@/lib/utils';

interface ProgressProps {
  value: number;
  className?: string;
  indicatorClassName?: string;
}

export function Progress({
  value,
  className,
  indicatorClassName,
}: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn(
        'h-2.5 w-full overflow-hidden rounded-full bg-muted',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full transition-all', indicatorClassName)}
        style={{width: `${clamped}%`}}
      />
    </div>
  );
}
