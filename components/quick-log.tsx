'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {Dumbbell, List, Plus, Scale, Utensils} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {FoodForm} from '@/components/food-form';
import {ExerciseForm} from '@/components/exercise-form';
import {WeightForm} from '@/components/weight-form';
import {
  TodaysExercisePlan,
  usePlannedExerciseToggle,
  type PlannedExercise,
} from '@/components/todays-exercise-plan';

type PlannedExerciseStatus = PlannedExercise & {completed: boolean};

type QuickLogProps = {
  plannedExercises: PlannedExerciseStatus[];
  aiEnabled?: boolean;
};

export function QuickLog({plannedExercises, aiEnabled}: QuickLogProps) {
  const [panel, setPanel] = useState<'food' | 'exercise' | 'weight' | null>(
    null,
  );
  const close = () => setPanel(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Button
          className="h-11 px-2"
          aria-label="Log food"
          onClick={() => setPanel('food')}
        >
          <Utensils />
          Food
        </Button>
        <Button
          variant="outline"
          className="h-11 px-2"
          aria-label="Log exercise"
          onClick={() => setPanel('exercise')}
        >
          <Dumbbell />
          Exercise
        </Button>
        <Button
          variant="outline"
          className="h-11 px-2"
          aria-label="Log weight"
          onClick={() => setPanel('weight')}
        >
          <Scale />
          Weight
        </Button>
      </div>

      <Dialog open={panel === 'food'} onClose={close} label="Log food">
        <FoodForm
          onLogCreated={close}
          aiEnabled={aiEnabled}
          headerAction={<LogsLink tab="food" onNavigate={close} />}
        />
      </Dialog>
      <Dialog open={panel === 'exercise'} onClose={close} label="Log exercise">
        <ExercisePanel
          goals={plannedExercises}
          onLogCreated={close}
          headerAction={<LogsLink tab="exercise" onNavigate={close} />}
        />
      </Dialog>
      <Dialog open={panel === 'weight'} onClose={close} label="Log weight">
        <WeightForm
          onLogCreated={close}
          headerAction={<LogsLink tab="weight" onNavigate={close} />}
        />
      </Dialog>
    </>
  );
}

/** Link button to the matching tab of the Logs page, for past entries. */
function LogsLink({
  tab,
  onNavigate,
}: {
  tab: 'food' | 'exercise' | 'weight';
  onNavigate: () => void;
}) {
  return (
    <Button
      asChild
      variant="link"
      size="sm"
      className="h-auto self-start px-0"
    >
      <Link href={`/logs?tab=${tab}`} onClick={onNavigate}>
        <List />
        View logs
      </Link>
    </Button>
  );
}

function ExercisePanel({
  goals,
  onLogCreated,
  headerAction,
}: {
  goals: PlannedExerciseStatus[];
  onLogCreated: () => void;
  headerAction: React.ReactNode;
}) {
  const hasPlan = goals.length > 0;
  const [showCustom, setShowCustom] = useState(!hasPlan);
  const customRef = useRef<HTMLDivElement>(null);
  const plan = usePlannedExerciseToggle(
    goals.filter((goal) => goal.completed).map((goal) => goal.id),
  );

  useEffect(() => {
    if (showCustom && hasPlan) {
      customRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, [showCustom, hasPlan]);

  return (
    <div className="space-y-4">
      {hasPlan && (
        <TodaysExercisePlan
          goals={goals}
          completedIds={plan.completedIds}
          pendingId={plan.pendingId}
          error={plan.error}
          onToggle={(goal, checked, result) =>
            void plan.toggle(goal, checked, result)
          }
          hideCompleted
          headerAction={headerAction}
        />
      )}
      {showCustom ? (
        <div ref={customRef}>
          <ExerciseForm
            plannedNames={goals.map((goal) => goal.name)}
            onLogCreated={onLogCreated}
            headerAction={hasPlan ? undefined : headerAction}
          />
        </div>
      ) : (
        <div className="px-6 pb-6">
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => setShowCustom(true)}
          >
            <Plus />
            Log custom exercise
          </Button>
        </div>
      )}
    </div>
  );
}
