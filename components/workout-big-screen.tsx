'use client';

import {useEffect, useRef, useSyncExternalStore, type ReactNode} from 'react';
import {Maximize2} from 'lucide-react';
import {ExerciseAnimation, ExerciseAreas} from '@/components/exercise-animation';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {exerciseCatalog} from '@/lib/exercise-catalog';
import type {AnimationSync, Side} from '@/lib/workout';
import {cn} from '@/lib/utils';

// Tailwind's md breakpoint, where the big screen is offered.
const DESKTOP_QUERY = '(min-width: 48rem)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the screen is desktop-wide; false on the server. */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * F11 toggles the big screen in place of the browser's own full screen, but
 * only while enabled (a workout or log review is showing) and on desktop.
 */
export function useBigScreenKey(enabled: boolean, onToggle: () => void) {
  const desktop = useIsDesktop();
  const toggle = useRef(onToggle);
  useEffect(() => {
    toggle.current = onToggle;
  });
  useEffect(() => {
    if (!enabled || !desktop) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'F11' || event.repeat) return;
      event.preventDefault();
      toggle.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, desktop]);
}

/** Opens the big screen; shown on desktop only. */
export function BigScreenButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('max-md:hidden', className)}
      onClick={onClick}
    >
      <Maximize2 />
      Big screen
    </Button>
  );
}

/**
 * Fills the window with the exercise's animation beside a large readout, so
 * a workout can be followed from across the room. Desktop only: on phones the
 * regular view already fills the screen.
 */
export function BigScreen({
  open,
  onClose,
  title,
  catalogId,
  sync,
  side,
  dimmed,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  catalogId: string | null | undefined;
  sync?: {key: string; message: AnimationSync};
  side?: Side;
  dimmed?: boolean;
  /** The readout beside the animation: counts, targets and controls. */
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  const entry = exerciseCatalog.get(catalogId);
  return (
    <Dialog
      open={open && desktop}
      onClose={onClose}
      label={`${title}, big screen`}
      className="h-dvh max-h-none w-screen max-w-none rounded-none"
    >
      <div
        data-testid="big-screen"
        className={cn(
          'grid h-full items-center gap-10 p-10',
          entry && 'grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
        )}
      >
        {entry && (
          <div className="space-y-3">
            <ExerciseAnimation
              // A sequence moves on to other exercises, each with its own scene.
              key={entry.id}
              entry={entry}
              sync={sync}
              side={side}
              dimmed={dimmed}
              maxHeightClassName="[&>*]:max-h-[calc(100dvh-9rem)]"
            />
            <ExerciseAreas entry={entry} className="text-center text-lg" />
          </div>
        )}
        <div className="flex min-w-0 flex-col items-center gap-8 text-center">
          <h2 className="wrap-break-word text-3xl font-semibold text-muted-foreground">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </Dialog>
  );
}
