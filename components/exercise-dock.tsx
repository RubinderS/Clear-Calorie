'use client';

import {BigScreenCoach} from '@/components/chat/coach-provider';
import {QuickTimer} from '@/components/quick-timer';

/**
 * The buttons an exercise pop-up's big screen keeps in its bottom-right
 * corner, workout or not: the timer, and the coach beside it. They're pinned
 * to the window, which mustn't scroll, and move aside for the coach's panel.
 * The pop-up's normal view has neither.
 */
export function ExerciseDock({big}: {big: boolean}) {
  if (!big) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-30 flex items-end gap-3 max-md:hidden has-data-coach-panel:right-[calc(420px+1.5rem)]">
      <QuickTimer />
      <BigScreenCoach />
    </div>
  );
}
