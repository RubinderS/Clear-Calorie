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

        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-foreground">
                <span
                  className={cn(
                    'font-semibold',
                    isOver ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {Math.round(item.value)}
                </span>{' '}
                / {item.goal}
                {item.unit}
              </span>
            </div>
            <Progress
              value={percent}
              indicatorClassName={cn(
                isOver ? 'bg-destructive' : item.colorClassName,
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
