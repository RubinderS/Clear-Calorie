'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {Dumbbell, List, PersonStanding, Plus, Utensils} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {FoodForm} from '@/components/food-form';
import {DaySwapControl} from '@/components/day-swap';
import {ExerciseForm} from '@/components/exercise-form';
import {WeightForm} from '@/components/weight-form';
import type {TrackedMetric} from '@/lib/body-metrics';
import {
  TodaysExercisePlan,
  usePlannedExerciseToggle,
  type PlannedExercise,
} from '@/components/todays-exercise-plan';
import {
  BIG_SCREEN_FRAME,
  BigScreenProvider,
  useBigScreenZoom,
  saveBigScreenPref,
  useBigScreenKeys,
  useIsDesktop,
} from '@/components/workout-big-screen';
import {cn} from '@/lib/utils';

export type PlannedExerciseStatus = PlannedExercise & {completed: boolean};

type QuickLogProps = {
  plannedExercises: PlannedExerciseStatus[];
  aiEnabled?: boolean;
  /** Active body metrics, logged in the body panel. */
  bodyMetrics?: TrackedMetric[];
};

export function QuickLog({
  plannedExercises,
  aiEnabled,
  bodyMetrics,
}: QuickLogProps) {
  const [panel, setPanel] = useState<LogPanel | null>(null);

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
          aria-label="Log body"
          onClick={() => setPanel('body')}
        >
          <PersonStanding />
          Body
        </Button>
      </div>

      <LogDialog
        panel={panel}
        onClose={() => setPanel(null)}
        plannedExercises={plannedExercises}
        aiEnabled={aiEnabled}
        bodyMetrics={bodyMetrics}
        showLogsLink
      />
    </>
  );
}

export type LogPanel = 'food' | 'exercise' | 'body';

type LogDialogProps = {
  /** The open panel, or null when closed. */
  panel: LogPanel | null;
  onClose: () => void;
  /** Called after anything is logged, including ticking a planned exercise. */
  onLogged?: () => void;
  plannedExercises?: PlannedExerciseStatus[];
  aiEnabled?: boolean;
  bodyMetrics?: TrackedMetric[];
  /** Limit the body panel to one field: 'weight' or a metric id. */
  bodyField?: string;
  /** Link each panel to its Logs tab. Off on the Logs page itself. */
  showLogsLink?: boolean;
};

/** The log dialogs opened from the Dashboard and the Logs page. */
export function LogDialog({
  panel,
  onClose,
  onLogged,
  plannedExercises = [],
  aiEnabled,
  bodyMetrics,
  bodyField,
  showLogsLink,
}: LogDialogProps) {
  const logCreated = () => {
    onClose();
    onLogged?.();
  };
  const logsLink = (tab: LogPanel) =>
    showLogsLink ? <LogsLink tab={tab} onNavigate={onClose} /> : undefined;

  return (
    <>
      <Dialog open={panel === 'food'} onClose={onClose} label="Log food">
        <FoodForm
          onLogCreated={logCreated}
          aiEnabled={aiEnabled}
          headerAction={logsLink('food')}
        />
      </Dialog>
      {/* Wider on desktop so long exercise names fit, and wider still during a workout. */}
      <Dialog
        open={panel === 'exercise'}
        onClose={onClose}
        label="Log exercise"
        className="md:max-w-3xl lg:max-w-4xl md:has-data-workout:max-w-5xl lg:has-data-workout:max-w-6xl"
      >
        <ExercisePanel
          goals={plannedExercises}
          onClose={onClose}
          onLogCreated={logCreated}
          onPlanChange={onLogged}
          headerAction={logsLink('exercise')}
        />
      </Dialog>
      <Dialog open={panel === 'body'} onClose={onClose} label="Log body">
        <WeightForm
          metrics={bodyMetrics}
          only={bodyField}
          onLogCreated={logCreated}
          headerAction={logsLink('body')}
        />
      </Dialog>
    </>
  );
}

type AddLogButtonProps = Omit<LogDialogProps, 'panel' | 'onClose'> & {
  panel: LogPanel;
  /** Accessible name, e.g. "Add food". */
  label: string;
  disabled?: boolean;
};

/** Plus button for a log card that opens the matching log dialog. */
export function AddLogButton({
  panel,
  label,
  disabled,
  ...dialogProps
}: AddLogButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-9 w-9 shrink-0"
      >
        <Plus aria-hidden="true" />
      </Button>
      <LogDialog
        panel={open ? panel : null}
        onClose={() => setOpen(false)}
        {...dialogProps}
      />
    </>
  );
}

/** Link button to the matching tab of the Logs page, for past entries. */
function LogsLink({
  tab,
  onNavigate,
}: {
  tab: 'food' | 'exercise' | 'body';
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
  onClose,
  onLogCreated,
  onPlanChange,
  headerAction,
}: {
  goals: PlannedExerciseStatus[];
  onClose: () => void;
  onLogCreated: () => void;
  onPlanChange?: () => void;
  headerAction: React.ReactNode;
}) {
  const hasPlan = goals.length > 0;
  const [showCustom, setShowCustom] = useState(!hasPlan);
  const customRef = useRef<HTMLDivElement>(null);
  const plan = usePlannedExerciseToggle(
    goals.filter((goal) => goal.completed).map((goal) => goal.id),
  );
  // The whole panel fills the window, so a workout can be followed from
  // across the room, from the plan through each exercise and its log.
  const desktop = useIsDesktop();
  const [bigOn, setBigOn] = useState(false);
  const bigScreen = {
    big: bigOn && desktop,
    setBig(next: boolean) {
      setBigOn(next);
      // Remembered, so the next workout starts the same way.
      saveBigScreenPref(next);
    },
  };
  const {big} = bigScreen;
  // Escape on the plan closes the panel, big screen and all, in one press;
  // a workout or log review opened over it goes back to the plan first.
  // Closing isn't turning the big screen off, so the next workout keeps it.
  useBigScreenKeys(true, {...bigScreen, back: onClose});
  const zoomStyle = useBigScreenZoom(big);

  useEffect(() => {
    if (showCustom && hasPlan) {
      customRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, [showCustom, hasPlan]);

  // A workout in progress has the panel to itself; custom logging waits.
  // Both wrappers are always there, so toggling the big screen restarts nothing.
  return (
    <BigScreenProvider value={bigScreen}>
      <div data-big-screen={big || undefined} className={cn('group', big && BIG_SCREEN_FRAME)}>
        <div className={cn('space-y-4', big && 'p-6')} style={zoomStyle}>
          {hasPlan && (
            <TodaysExercisePlan
              goals={goals}
              completedIds={plan.completedIds}
              pendingId={plan.pendingId}
              error={plan.error}
              onToggle={(goal, checked, details) =>
                void plan.toggle(goal, checked, details).then((changed) => {
                  if (changed) onPlanChange?.();
                })
              }
              hideCompleted
              headerAction={headerAction}
            />
          )}
          {/* A rest day can take another day's workout this week. */}
          {!hasPlan && <DaySwapControl className="px-6 pt-6" />}
          {showCustom ? (
            <div ref={customRef} className="group-has-data-workout:hidden">
              <ExerciseForm
                // Once ticked off, a planned exercise can be logged again as an extra.
                plannedNames={goals
                  .filter((goal) => !plan.completedIds.has(goal.id))
                  .map((goal) => goal.name)}
                onLogCreated={onLogCreated}
                headerAction={hasPlan ? undefined : headerAction}
              />
            </div>
          ) : (
            <div className="px-6 pb-6 group-has-data-workout:hidden">
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
      </div>
    </BigScreenProvider>
  );
}
