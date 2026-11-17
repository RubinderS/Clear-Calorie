// A quick countdown for the exercise panel: a plank hold, a stretch, a rest
// between sets logged by hand. It keeps the time it ends rather than counting
// down, since browsers slow intervals in background tabs and a count would
// drift.

/** The countdowns offered, in seconds. */
export const QUICK_TIMER_PRESETS = [10, 15, 30, 60] as const;
/** How much the − and + buttons take off or add. */
export const QUICK_TIMER_STEP_MS = 5_000;
/** The last seconds that each get a chime, before the one at the end. */
export const QUICK_TIMER_COUNT_SECONDS = 3;

export type QuickTimer = {
  /** What it was started with, for the ring's progress. */
  totalMs: number;
  /** When it ends, while running; null while paused. */
  endsAt: number | null;
  /** The time left when paused. */
  leftMs: number;
};

export function startQuickTimer(seconds: number, now: number): QuickTimer {
  const totalMs = seconds * 1000;
  return {totalMs, endsAt: now + totalMs, leftMs: totalMs};
}

export function quickTimerRunning(timer: QuickTimer): boolean {
  return timer.endsAt !== null;
}

export function quickTimerLeftMs(timer: QuickTimer, now: number): number {
  return timer.endsAt === null ? timer.leftMs : Math.max(0, timer.endsAt - now);
}

export function quickTimerDone(timer: QuickTimer, now: number): boolean {
  return quickTimerLeftMs(timer, now) === 0;
}

/** Pauses a running timer or resumes a paused one; a finished one stays put. */
export function toggleQuickTimer(timer: QuickTimer, now: number): QuickTimer {
  const leftMs = quickTimerLeftMs(timer, now);
  if (leftMs === 0) return timer;
  return timer.endsAt === null
    ? {...timer, endsAt: now + leftMs}
    : {...timer, endsAt: null, leftMs};
}

/**
 * Adds time to (or, negative, takes it off) a timer still going. It never
 * goes below a second, so − can't end it. Adding past the start grows the
 * ring's total, so its progress never runs backwards.
 */
export function adjustQuickTimer(timer: QuickTimer, deltaMs: number, now: number): QuickTimer {
  const leftMs = quickTimerLeftMs(timer, now);
  if (leftMs === 0) return timer;
  const next = Math.max(Math.min(leftMs, 1000), leftMs + deltaMs);
  const totalMs = Math.max(timer.totalMs, next);
  return timer.endsAt === null
    ? {...timer, totalMs, leftMs: next}
    : {...timer, totalMs, endsAt: now + next, leftMs: next};
}

/** The whole seconds left, rounded up, as the timer shows them. */
export function quickTimerSeconds(timer: QuickTimer, now: number): number {
  return Math.ceil(quickTimerLeftMs(timer, now) / 1000);
}

/** m:ss */
export function formatQuickTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
