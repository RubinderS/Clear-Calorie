import {Flame, Utensils} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {ProgressRing} from '@/components/ui/progress-ring';
import {cn} from '@/lib/utils';
import {Decimal, getGoalProgress} from '@/lib/decimal';

interface NutritionProgressItem {
  label: string;
  value: number;
  goal: number;
  unit: string;
  // Text color class (e.g. `text-purple-500`); rings and bars paint with currentColor.
  colorClassName: string;
}

interface CalorieTotals {
  eaten: number;
  burned: number;
  goal: number;
}

interface ExerciseTotals {
  done: number;
  total: number;
}

interface NutritionProgressProps {
  calories: CalorieTotals;
  exercise: ExerciseTotals;
  macros: NutritionProgressItem[];
  limits?: NutritionProgressItem[];
}

export function NutritionProgress({
  calories,
  exercise,
  macros,
  limits = [],
}: NutritionProgressProps) {
  return (
    <div className="@container space-y-8">
      {/* With equal gaps, columns 2-3 and 4-5 of 6 center between the 3 macro rings below. */}
      <div className="flex items-start justify-center gap-6 sm:gap-12 @2xl:grid @2xl:grid-cols-6 @2xl:gap-4">
        <div className="@2xl:col-span-2 @2xl:col-start-2">
          <CalorieSummary {...calories} />
        </div>
        <div className="@2xl:col-span-2 @2xl:col-start-4">
          <ExerciseSummary {...exercise} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {macros.map((item) => (
          <MacroRing key={item.label} item={item} />
        ))}
      </div>
      {limits.length > 0 && (
        <div className="space-y-5 border-t border-border/50 pt-6">
          {limits.map((item) => (
            <LimitBar key={item.label} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function CalorieSummary({eaten, burned, goal}: CalorieTotals) {
  const net = new Decimal(eaten).minus(burned).toNumber();
  const {percent, isOver, remaining, value} = getGoalProgress(net, goal);
  const stats = [
    {
      label: 'Eaten',
      value: eaten,
      icon: Utensils,
      iconClassName: 'text-blue-500',
    },
    {
      label: 'Burned',
      value: burned,
      icon: Flame,
      iconClassName: 'text-orange-500',
    },
  ];

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <ProgressRing
        value={percent}
        strokeWidth={6}
        className="size-32 sm:size-40"
        indicatorClassName={isOver ? 'text-destructive' : 'text-primary'}
      >
        <span
          className={cn(
            'text-2xl font-bold tabular-nums sm:text-3xl',
            isOver && 'text-destructive',
          )}
        >
          {remaining}
        </span>
        <span className="text-xs text-muted-foreground sm:text-sm">
          {isOver ? 'over goal' : 'remaining'}
        </span>
      </ProgressRing>
      <div>
        <p className="text-sm font-medium">Calories</p>
        <p className="text-xs text-muted-foreground">
          {value} / {goal}
        </p>
      </div>
      <dl className="flex justify-center gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-1.5"
            title={stat.label}
          >
            <dt className="flex">
              <stat.icon
                className={cn('size-4', stat.iconClassName)}
                aria-hidden="true"
              />
              <span className="sr-only">{stat.label}</span>
            </dt>
            <dd className="text-sm font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ExerciseSummary({done, total}: ExerciseTotals) {
  const hasGoals = total > 0;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        role="progressbar"
        aria-label="Exercise goals completed"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <ProgressRing
          value={hasGoals ? (done / total) * 100 : 0}
          strokeWidth={6}
          className="size-32 sm:size-40"
          indicatorClassName="text-green-500"
        >
          <span className="text-2xl font-bold tabular-nums sm:text-3xl">
            {hasGoals ? `${done}/${total}` : '–'}
          </span>
          <span className="text-xs text-muted-foreground sm:text-sm">
            {hasGoals ? 'done' : 'none planned'}
          </span>
        </ProgressRing>
      </div>
      <div>
        <p className="text-sm font-medium">Exercise</p>
        <p className="text-xs text-muted-foreground">Today&apos;s goals</p>
      </div>
    </div>
  );
}

function MacroRing({item}: {item: NutritionProgressItem}) {
  const {percent, isOver, remaining, value} = getGoalProgress(
    item.value,
    item.goal,
  );

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <ProgressRing
        value={percent}
        className="size-24 sm:size-28 lg:size-32"
        indicatorClassName={isOver ? 'text-destructive' : item.colorClassName}
      >
        <span
          className={cn(
            'text-base font-semibold tabular-nums lg:text-lg',
            isOver && 'text-destructive',
          )}
        >
          {remaining}
        </span>
        <span className="text-xs text-muted-foreground">
          {isOver ? 'over' : 'left'}
        </span>
      </ProgressRing>
      <div>
        <p className="text-sm font-medium">
          {item.label}
          {item.unit && (
            <span className="font-normal text-muted-foreground">
              {' '}
              ({item.unit})
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {value} / {item.goal}
        </p>
      </div>
    </div>
  );
}

function LimitBar({item}: {item: NutritionProgressItem}) {
  const {percent, isOver, remaining, value} = getGoalProgress(
    item.value,
    item.goal,
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{item.label}</span>
        <span
          className={cn(
            'font-semibold',
            isOver ? 'text-destructive' : 'text-foreground',
          )}
        >
          {isOver
            ? `${remaining}${item.unit} over limit`
            : `${remaining}${item.unit} remaining`}
        </span>
      </div>
      <Progress
        value={percent}
        indicatorClassName={cn(
          'bg-current',
          isOver ? 'text-destructive' : item.colorClassName,
        )}
      />
      <p className="text-xs text-muted-foreground">
        {value} / {item.goal}
        {item.unit}
      </p>
    </div>
  );
}
