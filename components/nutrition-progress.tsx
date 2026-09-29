import {Progress} from '@/components/ui/progress';
import {cn} from '@/lib/utils';

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
        const percent = item.goal > 0 ? (item.value / item.goal) * 100 : 0;
        const isOver = item.value > item.goal;
        const remaining = Math.round(item.goal - item.value);

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
                  ? `${Math.abs(remaining)}${item.unit} over goal`
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
              {Math.round(item.value)} / {item.goal}
              {item.unit}
            </p>
          </div>
        );
      })}
    </div>
  );
}
