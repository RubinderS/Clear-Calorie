'use client';

import {useRef, useState, useSyncExternalStore} from 'react';
import {ChevronDown, Minus, Pause, Play, Plus, RotateCcw, Timer} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ProgressRing} from '@/components/ui/progress-ring';
import {useBigScreen} from '@/components/workout-big-screen';
import {
  QUICK_TIMER_COUNT_SECONDS,
  QUICK_TIMER_PRESETS,
  QUICK_TIMER_STEP_MS,
  adjustQuickTimer,
  formatQuickTimer,
  quickTimerLeftMs,
  quickTimerRunning,
  quickTimerSeconds,
  startQuickTimer,
  toggleQuickTimer,
  type QuickTimer as QuickTimerState,
} from '@/lib/quick-timer';
import {playTimerChime, unlockAudio} from '@/lib/workout-sound';
import {cn} from '@/lib/utils';

// Often enough that the seconds and the ring never visibly lag.
const TICK_MS = 200;

/*
 * One timer for every exercise big screen, so a countdown started on the plan
 * carries on in a How to opened over it, and chimes only once. It ticks here
 * rather than in a component, and clears once no big screen shows it.
 */
type Snapshot = {timer: QuickTimerState | null; now: number};

let snapshot: Snapshot = {timer: null, now: 0};
const listeners = new Set<() => void>();
let interval: number | undefined;
// The last whole second shown, so each count chimes once.
let lastSecond: number | null = null;

function setSnapshot(next: Snapshot) {
  snapshot = next;
  const running = next.timer !== null && quickTimerRunning(next.timer);
  if (running && interval === undefined) {
    interval = window.setInterval(tick, TICK_MS);
  } else if (!running && interval !== undefined) {
    window.clearInterval(interval);
    interval = undefined;
  }
  for (const listener of listeners) listener();
}

function tick() {
  const {timer} = snapshot;
  if (!timer) return;
  const now = Date.now();
  const seconds = quickTimerSeconds(timer, now);
  const last = lastSecond;
  lastSecond = seconds;
  if (seconds === 0) {
    playTimerChime('end');
    navigator.vibrate?.([200, 100, 200]);
    setSnapshot({timer: {...timer, endsAt: null, leftMs: 0}, now});
    return;
  }
  if (last !== null && seconds < last && seconds <= QUICK_TIMER_COUNT_SECONDS) {
    playTimerChime('count');
  }
  setSnapshot({timer, now});
}

/** Must be called from a tap, so the chimes can play later (iOS). */
function update(change: (timer: QuickTimerState | null, now: number) => QuickTimerState | null) {
  unlockAudio();
  const now = Date.now();
  setSnapshot({timer: change(snapshot.timer, now), now});
}

function startTimer(seconds: number) {
  lastSecond = null;
  update((_, now) => startQuickTimer(seconds, now));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Once every big screen has closed, rather than chime with nothing on screen.
    // Later, so a big screen handing over to another doesn't clear it.
    window.setTimeout(() => {
      if (listeners.size === 0 && snapshot.timer) setSnapshot({timer: null, now: 0});
    });
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = (): Snapshot => ({timer: null, now: 0});

/**
 * Quick countdowns of 10 seconds to a minute, on every exercise big screen: a
 * plank hold, a stretch, a rest between sets logged by hand. A button opens
 * it; it keeps counting, shown on the button, while closed. The last seconds
 * chime and the end rings the set-end chord, as a workout does.
 */
export function QuickTimer({className}: {className?: string}) {
  const big = useBigScreen();
  const [open, setOpen] = useState(false);
  const {timer, now} = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const running = timer !== null && quickTimerRunning(timer);

  const leftMs = timer ? quickTimerLeftMs(timer, now) : 0;
  const seconds = timer ? quickTimerSeconds(timer, now) : 0;
  const done = timer !== null && leftMs === 0;
  const progress = timer ? (100 * leftMs) / timer.totalMs : 0;

  return (
    <div
      className={cn('pointer-events-none flex items-end', className)}
    >
      {open ? (
        <section
          aria-label="Timer"
          className={cn(
            'pointer-events-auto w-72 space-y-3 rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-xl',
            big && 'w-80 space-y-4 p-5',
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Timer aria-hidden className="size-4" /> Timer
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 size-9"
              aria-label="Hide timer"
              onClick={() => {
                setOpen(false);
                // The button that opened it, once it's back.
                requestAnimationFrame(() => toggleRef.current?.focus({preventScroll: true}));
              }}
            >
              <ChevronDown aria-hidden />
            </Button>
          </div>

          <div className="flex justify-center">
            <ProgressRing
              value={progress}
              strokeWidth={5}
              className={cn('size-32', big && 'size-40')}
              indicatorClassName={done ? 'text-muted' : 'text-primary'}
            >
              <span
                role="timer"
                className={cn(
                  'text-4xl font-semibold tabular-nums tracking-tight',
                  big && 'text-5xl',
                )}
              >
                {formatQuickTimer(seconds)}
              </span>
              <span
                aria-live="polite"
                className="mt-1 h-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {done ? 'Done' : timer && !running ? 'Paused' : ''}
              </span>
            </ProgressRing>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {QUICK_TIMER_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                className={cn('h-10 px-0 tabular-nums', big && 'h-12 text-base')}
                aria-label={`Start a ${preset} second timer`}
                onClick={() => startTimer(preset)}
              >
                {preset < 60 ? `${preset}s` : `${preset / 60}m`}
              </Button>
            ))}
          </div>

          {timer && (
            <div className="grid grid-cols-4 gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10 px-0"
                aria-label={`${QUICK_TIMER_STEP_MS / 1000} seconds less`}
                disabled={done || leftMs <= 1000}
                onClick={() => update((t, time) => t && adjustQuickTimer(t, -QUICK_TIMER_STEP_MS, time))}
              >
                <Minus aria-hidden />
                {QUICK_TIMER_STEP_MS / 1000}s
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-10 px-0"
                aria-label={running ? 'Pause timer' : 'Resume timer'}
                disabled={done}
                onClick={() => update((t, time) => t && toggleQuickTimer(t, time))}
              >
                {running ? <Pause aria-hidden /> : <Play aria-hidden />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 px-0"
                aria-label={`${QUICK_TIMER_STEP_MS / 1000} seconds more`}
                disabled={done}
                onClick={() => update((t, time) => t && adjustQuickTimer(t, QUICK_TIMER_STEP_MS, time))}
              >
                <Plus aria-hidden />
                {QUICK_TIMER_STEP_MS / 1000}s
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 px-0"
                aria-label="Clear timer"
                onClick={() => update(() => null)}
              >
                <RotateCcw aria-hidden />
              </Button>
            </div>
          )}
        </section>
      ) : (
        <Button
          ref={toggleRef}
          type="button"
          variant={timer && !done ? 'default' : 'outline'}
          className={cn(
            'pointer-events-auto h-11 rounded-full bg-card px-4 shadow-lg',
            timer && !done && 'bg-primary',
            big && 'h-12 px-5',
          )}
          aria-label={timer && !done ? `Timer, ${seconds} seconds left` : 'Timer'}
          onClick={() => setOpen(true)}
        >
          <Timer aria-hidden />
          {timer && !done ? (
            <span className="tabular-nums">
              {formatQuickTimer(seconds)}
              {!running && ' paused'}
            </span>
          ) : (
            'Timer'
          )}
        </Button>
      )}
    </div>
  );
}
