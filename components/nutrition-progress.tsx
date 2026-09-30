import {Progress} from '@/components/ui/progress';
import {cn} from '@/lib/utils';
import {getGoalProgress} from '@/lib/decimal';

interface NutritionProgressItem {
  label: string;
  value: number;
  goal: number;
  unit: string;
  colorClassName: string;
}

interface NutritionProgressProps {
  items: NutritionProgressItem[];
}

export function NutritionProgress({items}: NutritionProgressProps) {
  return (
    <div className="space-y-5">
      {items.map((item) => {
        const {percent, isOver, remaining, value} = getGoalProgress(
          item.value,
          item.goal,
        );

        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{item.label}</span>
              <span
                className={cn(
                  'font-semibold',
                  isOver ? 'text-destructive' : 'text-foreground',
                )}
              >
                {isOver
                  ? `${remaining}${item.unit} over goal`
                  : `${remaining}${item.unit} remaining`}
              </span>
            </div>
            <Progress
              value={percent}
              indicatorClassName={cn(
                isOver ? 'bg-destructive' : item.colorClassName,
              )}
            />
            <p className={cn('text-xs text-muted-foreground')}>
              {value} / {item.goal}
              {item.unit}
            </p>
          </div>
        );
      })}
    </div>
  );
}
