'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Check, Minus, Pause, Play, Plus, SkipForward, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ProgressRing} from '@/components/ui/progress-ring';
import type {PlannedExercise} from '@/components/todays-exercise-plan';
import {formatExerciseDetail} from '@/lib/exercise';
import {
  DEFAULT_TEMPO_MS,
  MAX_REPS,
  MAX_TEMPO_MS,
  MIN_TEMPO_MS,
  REST_ADJUST_MS,
  TEMPO_STEP_MS,
  adjustRest,
  buildWorkoutSteps,
  clampReps,
  clampTempo,
  currentCue,
  currentStepDurationMs,
  elapsedMs,
  formatClock,
  isRunning,
  nextStep,
  remainingMs,
  setEndCue,
  setReps,
  setTempo,
  startWorkout,
  tickWorkout,
  togglePause,
  type WorkoutState,
  type WorkoutStep,
} from '@/lib/workout';
import {
  createWorkoutSound,
  type SoundMode,
  type WorkoutSound,
} from '@/lib/workout-sound';

export type WorkoutResult = {sets: number; reps: number};

// Sets tick faster so rep cues land close to the beat.
const SET_TICK_MS = 50;
const TICK_MS = 250;
// Cues this late (e.g. after returning from the background) are skipped.
const MAX_CUE_LATE_MS = 400;
const PREFS_KEY = 'clearcalorie:workout-prefs';

const SOUND_OPTIONS: {mode: SoundMode; label: string}[] = [
  {mode: 'tones', label: 'Tones'},
  {mode: 'count', label: 'Count'},
];

type WorkoutPrefs = {mode: SoundMode; tempoMs: number};

function loadPrefs(): WorkoutPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    return {
      mode: saved?.mode === 'count' ? 'count' : 'tones',
      tempoMs: clampTempo(Number(saved?.tempoMs) || DEFAULT_TEMPO_MS),
    };
  } catch {
    return {mode: 'tones', tempoMs: DEFAULT_TEMPO_MS};
  }
}

function savePrefs(prefs: WorkoutPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function formatTempo(tempoMs: number) {
  return `${tempoMs / 1000} s / rep`;
}

/** Keeps the screen awake while enabled, re-acquiring after the tab is shown again. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) void lock.release();
          else sentinel = lock;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release();
    };
  }, [enabled]);
}

type StepperProps = {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement: boolean;
  canIncrement: boolean;
};

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
}: StepperProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 py-2 pl-4 pr-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={!canDecrement}
          onClick={onDecrement}
        >
          <Minus />
        </Button>
        <span className="w-20 text-center text-sm font-semibold tabular-nums">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={!canIncrement}
          onClick={onIncrement}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function TempoStepper({
  tempoMs,
  onChange,
}: {
  tempoMs: number;
  onChange: (tempoMs: number) => void;
}) {
  return (
    <Stepper
      label="Tempo"
      value={formatTempo(tempoMs)}
      onDecrement={() => onChange(tempoMs - TEMPO_STEP_MS)}
      onIncrement={() => onChange(tempoMs + TEMPO_STEP_MS)}
      canDecrement={tempoMs > MIN_TEMPO_MS}
      canIncrement={tempoMs < MAX_TEMPO_MS}
    />
  );
}

function RepsStepper({
  reps,
  onChange,
}: {
  reps: number;
  onChange: (reps: number) => void;
}) {
  return (
    <Stepper
      label="Reps"
      value={`${reps} reps`}
      onDecrement={() => onChange(reps - 1)}
      onIncrement={() => onChange(reps + 1)}
      canDecrement={reps > 1}
      canIncrement={reps < MAX_REPS}
    />
  );
}

type Session = {
  initial: WorkoutState;
  mode: SoundMode;
  sound: WorkoutSound | null;
};

type WorkoutSessionProps = {
  goal: PlannedExercise;
  /** When the Start tap happened; time goals begin right away. */
  startedAt: number;
  onComplete: (result?: WorkoutResult) => void;
  onCancel: () => void;
};

export function WorkoutSession({
  goal,
  startedAt,
  onComplete,
  onCancel,
}: WorkoutSessionProps) {
  const [session, setSession] = useState<Session | null>(() =>
    goal.type === 'STRENGTH'
      ? null
      : {
          initial: startWorkout(buildWorkoutSteps(goal), startedAt),
          mode: 'tones',
          sound: null,
        },
  );

  if (!session) {
    return (
      <StrengthSetup goal={goal} onStart={setSession} onCancel={onCancel} />
    );
  }
  return (
    <ActiveWorkout
      goal={goal}
      session={session}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}

function StrengthSetup({
  goal,
  onStart,
  onCancel,
}: {
  goal: PlannedExercise;
  onStart: (session: Session) => void;
  onCancel: () => void;
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [reps, setRepsValue] = useState(() => clampReps(goal.reps ?? 10));

  function start() {
    savePrefs(prefs);
    onStart({
      initial: startWorkout(buildWorkoutSteps(goal), Date.now(), {
        reps,
        tempoMs: prefs.tempoMs,
      }),
      mode: prefs.mode,
      sound: createWorkoutSound(),
    });
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Sound" className="grid grid-cols-2 gap-2">
        {SOUND_OPTIONS.map((option) => (
          <Button
            key={option.mode}
            type="button"
            variant={prefs.mode === option.mode ? 'default' : 'outline'}
            aria-pressed={prefs.mode === option.mode}
            onClick={() => setPrefs({...prefs, mode: option.mode})}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <TempoStepper
        tempoMs={prefs.tempoMs}
        onChange={(tempoMs) =>
          setPrefs({...prefs, tempoMs: clampTempo(tempoMs)})
        }
      />
      <RepsStepper
        reps={reps}
        onChange={(value) => setRepsValue(clampReps(value))}
      />
      <Button className="h-12 w-full" onClick={start}>
        <Play />
        Start {goal.sets ?? 1} {goal.sets === 1 ? 'set' : 'sets'}
      </Button>
      <Button variant="ghost" size="sm" className="w-full" onClick={onCancel}>
        <X />
        Cancel
      </Button>
    </div>
  );
}

function stepLabel(step: WorkoutStep): string {
  if (step.kind === 'set') return `Set ${step.set} of ${step.sets}`;
  if (step.kind === 'rest') return 'Rest';
  return 'Workout';
}

function stepDetail(
  step: WorkoutStep,
  state: WorkoutState,
  goal: PlannedExercise,
): string {
  if (step.kind === 'rest') return `Next: set ${step.nextSet} of ${step.sets}`;
  if (step.kind === 'set') {
    const reps = `${state.reps} reps`;
    return goal.weight ? `${reps} @ ${goal.weight}` : reps;
  }
  return formatExerciseDetail(goal);
}

function ActiveWorkout({
  goal,
  session,
  onComplete,
  onCancel,
}: {
  goal: PlannedExercise;
  session: Session;
  onComplete: (result?: WorkoutResult) => void;
  onCancel: () => void;
}) {
  const {initial, mode, sound} = session;
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(() => initial.timer.startedAt ?? 0);
  const stateRef = useRef(initial);
  const lastCueKey = useRef<string | null>(null);
  const completed = useRef(false);

  const step = state.steps[state.index];
  const running = isRunning(state.timer) && !state.done;
  const inSet = step.kind === 'set';

  useWakeLock(!state.done);

  const playCue = useCallback(
    (current: WorkoutState, time: number) => {
      const cue = currentCue(current, time);
      if (!cue || cue.key === lastCueKey.current) return;
      lastCueKey.current = cue.key;
      if (cue.lateMs <= MAX_CUE_LATE_MS) sound?.play(cue.cue, mode, current.tempoMs);
    },
    [sound, mode],
  );

  /** Applies a change, advances finished steps and sounds any cue reached. */
  const advance = useCallback(
    (change?: (current: WorkoutState, time: number) => WorkoutState) => {
      const time = Date.now();
      const previous = stateRef.current;
      if (isRunning(previous.timer)) playCue(previous, time);
      const next = tickWorkout(
        change ? change(previous, time) : previous,
        time,
      );
      if (next !== previous && isRunning(next.timer)) playCue(next, time);
      const endCue = setEndCue(previous, next);
      if (endCue) sound?.play(endCue, mode, next.tempoMs);
      stateRef.current = next;
      setState(next);
      setNow(time);
    },
    [playCue, sound, mode],
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => advance(), inSet ? SET_TICK_MS : TICK_MS);
    return () => clearInterval(id);
  }, [running, inSet, advance]);

  useEffect(() => {
    if (!state.done || completed.current) return;
    completed.current = true;
    onComplete(
      goal.type === 'STRENGTH'
        ? {sets: Math.max(1, state.setsCompleted), reps: state.reps}
        : undefined,
    );
  }, [state.done, state.setsCompleted, state.reps, goal.type, onComplete]);

  function changeTempo(tempoMs: number) {
    savePrefs({mode, tempoMs: clampTempo(tempoMs)});
    advance((current, time) => setTempo(current, tempoMs, time));
  }

  const cue = inSet ? currentCue(state, now)?.cue : undefined;
  const isLastStep = state.index === state.steps.length - 1;
  const progress = inSet
    ? cue?.type === 'rep'
      ? (100 * cue.n) / state.reps
      : 0
    : (100 * elapsedMs(state.timer, now)) / currentStepDurationMs(state);

  let display = formatClock(remainingMs(state, now));
  let caption = 'Remaining';
  if (cue?.type === 'leadIn') {
    display = String(cue.n);
    caption = 'Get ready';
  } else if (cue?.type === 'go') {
    display = 'Go';
    caption = `of ${state.reps} reps`;
  } else if (cue?.type === 'rep') {
    display = String(cue.n);
    caption = `of ${state.reps} reps`;
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center" aria-live="polite">
        <p className="text-lg font-semibold">{stepLabel(step)}</p>
        <p className="text-sm text-muted-foreground">
          {stepDetail(step, state, goal)}
        </p>
      </div>

      <ProgressRing
        value={progress}
        strokeWidth={5}
        className="size-52"
        indicatorClassName={
          step.kind === 'rest' ? 'text-sky-500' : 'text-primary'
        }
      >
        <span
          role="timer"
          className="text-5xl font-semibold tabular-nums tracking-tight"
        >
          {display}
        </span>
        <span className="mt-1 h-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {running ? caption : 'Paused'}
        </span>
      </ProgressRing>

      {inSet && (
        <div className="w-full space-y-2">
          <TempoStepper tempoMs={state.tempoMs} onChange={changeTempo} />
          <RepsStepper
            reps={state.reps}
            onChange={(reps) => advance((current) => setReps(current, reps))}
          />
        </div>
      )}

      {step.kind === 'rest' && (
        <div className="grid w-full grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() =>
              advance((current) => adjustRest(current, -REST_ADJUST_MS))
            }
          >
            −{REST_ADJUST_MS / 1000}s
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              advance((current) => adjustRest(current, REST_ADJUST_MS))
            }
          >
            +{REST_ADJUST_MS / 1000}s
          </Button>
        </div>
      )}

      <div className="grid w-full grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-12"
          onClick={() => advance(togglePause)}
        >
          {running ? <Pause /> : <Play />}
          {running ? 'Pause' : 'Resume'}
        </Button>
        <Button className="h-12" onClick={() => advance(nextStep)}>
          {step.kind === 'rest' ? <SkipForward /> : <Check />}
          {step.kind === 'rest'
            ? 'Skip rest'
            : step.kind === 'set' && !isLastStep
              ? 'Set done'
              : 'Finish'}
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={onCancel}>
        <X />
        Cancel without logging
      </Button>
    </div>
  );
}
