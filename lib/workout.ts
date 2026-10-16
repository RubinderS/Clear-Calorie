// Interactive workout session logic. Timers are timestamp based so they stay
// accurate when the tab is backgrounded or the device sleeps.

/** A set as planned: for reps, or for a time. */
export type PlannedSet = {reps?: number | null; durationSec?: number | null};

/** A set as done in the workout. */
export type CompletedSet = {reps: number} | {durationSec: number};

export type WorkoutStep =
  | {kind: 'work'; durationMs: number; set: number; sets: number}
  | {kind: 'set'; set: number; sets: number; reps: number}
  | {kind: 'rest'; durationMs: number; nextSet: number; sets: number};

export type Timer = {accumulatedMs: number; startedAt: number | null};

export type WorkoutState = {
  steps: WorkoutStep[];
  index: number;
  timer: Timer;
  done: boolean;
  /** Reps in the current set; adjustable during the session. */
  reps: number;
  /** Time per rep in a set. */
  tempoMs: number;
  setsCompleted: number;
  /** Each finished set: its reps as set when it ended, or the time worked. */
  completed: CompletedSet[];
};

export type WorkoutCue =
  | {type: 'leadIn'; n: number}
  | {type: 'go'}
  | {type: 'rep'; n: number}
  | {type: 'setEnd'; lastSet: boolean};

export const DEFAULT_REST_MS = 60_000;
export const REST_ADJUST_MS = 15_000;
// Slow enough for each "3, 2, 1" to be spoken in full before the next.
export const LEAD_IN_BEAT_MS = 2_000;
// The first count-in is longer to leave time to get set up.
export const FIRST_LEAD_IN_BEATS = 5;
export const LEAD_IN_BEATS = 3;
export const DEFAULT_TEMPO_MS = 3_000;
export const MIN_TEMPO_MS = 1_000;
export const MAX_TEMPO_MS = 6_000;
export const TEMPO_STEP_MS = 500;
export const MAX_REPS = 100;

/** Each set in turn, with rests between: rep sets count reps, timed sets count down. */
export function buildWorkoutSteps(
  planned: readonly PlannedSet[],
  restMs = DEFAULT_REST_MS,
): WorkoutStep[] {
  const sets = Math.max(1, planned.length);
  const list = planned.length > 0 ? planned : [{reps: 1}];
  return list
    .map((plannedSet, i): WorkoutStep[] => {
      const set: WorkoutStep =
        plannedSet.reps != null
          ? {kind: 'set', set: i + 1, sets, reps: clampReps(plannedSet.reps)}
          : {
              kind: 'work',
              durationMs: Math.max(1, plannedSet.durationSec ?? 60) * 1000,
              set: i + 1,
              sets,
            };
      return i === 0
        ? [set]
        : [{kind: 'rest', durationMs: restMs, nextSet: i + 1, sets}, set];
    })
    .flat();
}

export function clampTempo(tempoMs: number): number {
  return Math.min(MAX_TEMPO_MS, Math.max(MIN_TEMPO_MS, tempoMs));
}

export function clampReps(reps: number): number {
  return Math.min(MAX_REPS, Math.max(1, Math.round(reps)));
}

export function elapsedMs(timer: Timer, now: number): number {
  return (
    timer.accumulatedMs + (timer.startedAt === null ? 0 : now - timer.startedAt)
  );
}

export function isRunning(timer: Timer): boolean {
  return timer.startedAt !== null;
}

export function pauseTimer(timer: Timer, now: number): Timer {
  if (timer.startedAt === null) return timer;
  return {accumulatedMs: elapsedMs(timer, now), startedAt: null};
}

export function resumeTimer(timer: Timer, now: number): Timer {
  if (timer.startedAt !== null) return timer;
  return {...timer, startedAt: now};
}

export function leadInBeats(state: WorkoutState): number {
  return state.index === 0 ? FIRST_LEAD_IN_BEATS : LEAD_IN_BEATS;
}

export function leadInMs(state: WorkoutState): number {
  return leadInBeats(state) * LEAD_IN_BEAT_MS;
}

/** Sets and timed work start with a lead-in; a set then runs one tempo beat per rep. */
export function currentStepDurationMs(state: WorkoutState): number {
  const step = state.steps[state.index];
  if (step.kind === 'set') return leadInMs(state) + state.reps * state.tempoMs;
  if (step.kind === 'work') return leadInMs(state) + step.durationMs;
  return step.durationMs;
}

export function remainingMs(state: WorkoutState, now: number): number {
  return Math.max(
    0,
    currentStepDurationMs(state) - elapsedMs(state.timer, now),
  );
}

/** `options.reps`, when given, replaces the planned reps of every rep set. */
export function startWorkout(
  steps: WorkoutStep[],
  now: number,
  options: {reps?: number; tempoMs?: number} = {},
): WorkoutState {
  const planned =
    options.reps === undefined
      ? steps
      : steps.map((step) =>
          step.kind === 'set'
            ? {...step, reps: clampReps(options.reps ?? step.reps)}
            : step,
        );
  const firstSet = planned.find((step) => step.kind === 'set');
  return {
    steps: planned,
    index: 0,
    timer: {accumulatedMs: 0, startedAt: now},
    done: planned.length === 0,
    reps: firstSet?.kind === 'set' ? firstSet.reps : 1,
    tempoMs: clampTempo(options.tempoMs ?? DEFAULT_TEMPO_MS),
    setsCompleted: 0,
    completed: [],
  };
}

/** The current step as a finished set, or null during a rest. */
function finishedSet(state: WorkoutState, at: number): CompletedSet | null {
  const step = state.steps[state.index];
  if (step.kind === 'set') return {reps: state.reps};
  if (step.kind === 'rest') return null;
  const worked = Math.min(
    step.durationMs,
    elapsedMs(state.timer, at) - leadInMs(state),
  );
  // Ended before the countdown got going, so take the time as planned.
  const ms = worked >= 1000 ? worked : step.durationMs;
  return {durationSec: Math.round(ms / 1000)};
}

/**
 * Reps for the set at `index`. A change made during one set carries on while
 * the plan keeps the same reps, as it did when every set had to match.
 */
function repsFor(state: WorkoutState, index: number): number {
  const step = state.steps[index];
  if (step.kind !== 'set') return state.reps;
  const previous = state.steps
    .slice(0, index)
    .findLast((earlier) => earlier.kind === 'set');
  return previous?.kind === 'set' && previous.reps === step.reps
    ? state.reps
    : step.reps;
}

/** Moves to the next step with its timer starting at `at`; finishes after the last step. */
export function nextStep(state: WorkoutState, at: number): WorkoutState {
  if (state.done) return state;
  const finished = finishedSet(state, at);
  const setsCompleted = state.setsCompleted + (finished ? 1 : 0);
  const completed = finished
    ? [...state.completed, finished]
    : state.completed;
  const index = state.index + 1;
  if (index >= state.steps.length) {
    return {
      ...state,
      setsCompleted,
      completed,
      timer: pauseTimer(state.timer, at),
      done: true,
    };
  }
  return {
    ...state,
    index,
    reps: repsFor(state, index),
    setsCompleted,
    completed,
    timer: {accumulatedMs: 0, startedAt: at},
  };
}

/**
 * Advances past steps that have run out by `now`. Each following step starts
 * when the previous one actually ended, not when this was called.
 * Returns the same object when nothing changed.
 */
export function tickWorkout(state: WorkoutState, now: number): WorkoutState {
  let next = state;
  while (!next.done && isRunning(next.timer)) {
    const duration = currentStepDurationMs(next);
    const elapsed = elapsedMs(next.timer, now);
    if (elapsed < duration) break;
    next = nextStep(next, now - (elapsed - duration));
  }
  return next;
}

export function togglePause(state: WorkoutState, now: number): WorkoutState {
  return {
    ...state,
    timer: isRunning(state.timer)
      ? pauseTimer(state.timer, now)
      : resumeTimer(state.timer, now),
  };
}

/** Changes the current rest and every later rest, so the choice sticks for the session. */
export function adjustRest(state: WorkoutState, deltaMs: number): WorkoutState {
  return {
    ...state,
    steps: state.steps.map((step, i) =>
      step.kind === 'rest' && i >= state.index
        ? {...step, durationMs: Math.max(0, step.durationMs + deltaMs)}
        : step,
    ),
  };
}

/** Beats before `leadInBeats` are the lead-in and beat `leadInBeats` is "go". */
function leadInBeat(state: WorkoutState, elapsed: number) {
  const beat = Math.min(
    leadInBeats(state),
    Math.floor(elapsed / LEAD_IN_BEAT_MS),
  );
  return {beat, startMs: beat * LEAD_IN_BEAT_MS};
}

/** Lead-in beats, then beat `leadInBeats` + k is rep k. */
function setBeat(state: WorkoutState, elapsed: number) {
  const leadIn = leadInMs(state);
  if (elapsed < leadIn) return leadInBeat(state, elapsed);
  const rep = Math.min(
    state.reps,
    Math.floor((elapsed - leadIn) / state.tempoMs),
  );
  return {beat: leadInBeats(state) + rep, startMs: leadIn + rep * state.tempoMs};
}

/** Reps finished in the current set (0 outside a set). */
export function repsDone(state: WorkoutState, now: number): number {
  if (state.done || state.steps[state.index].kind !== 'set') return 0;
  const {beat} = setBeat(state, elapsedMs(state.timer, now));
  return Math.max(0, beat - leadInBeats(state));
}

/**
 * The latest cue reached in the current set or timed work, with how late
 * `now` is for it. Timed work only counts in, then stays on "go". Time past
 * the end of a set counts toward its final rep, so the last count still
 * sounds when the set ends between ticks. `key` is stable for a beat so
 * callers can play each cue once.
 */
export function currentCue(
  state: WorkoutState,
  now: number,
): {key: string; cue: WorkoutCue; lateMs: number} | null {
  const step = state.steps[state.index];
  if (state.done || step.kind === 'rest') return null;
  const elapsed = elapsedMs(state.timer, now);
  const {beat, startMs} =
    step.kind === 'work'
      ? leadInBeat(state, elapsed)
      : setBeat(state, Math.min(elapsed, currentStepDurationMs(state)));
  const beats = leadInBeats(state);
  const cue: WorkoutCue =
    beat < beats
      ? {type: 'leadIn', n: beats - beat}
      : beat === beats
        ? {type: 'go'}
        : {type: 'rep', n: beat - beats};
  return {key: `${state.index}:${beat}`, cue, lateMs: elapsed - startMs};
}

/**
 * The cue for a set that ended between two states, whether its reps ran out
 * or the user ended it early. Skipped when catching up after the background
 * has already carried the workout into the next set.
 */
export function setEndCue(
  previous: WorkoutState,
  next: WorkoutState,
): WorkoutCue | null {
  if (next.setsCompleted <= previous.setsCompleted) return null;
  if (next.done) return {type: 'setEnd', lastSet: true};
  return next.steps[next.index].kind === 'rest'
    ? {type: 'setEnd', lastSet: false}
    : null;
}

/** Changes the tempo, keeping the reps done and the progress into the current rep. */
export function setTempo(
  state: WorkoutState,
  tempoMs: number,
  now: number,
): WorkoutState {
  const nextTempo = clampTempo(tempoMs);
  const step = state.steps[state.index];
  const elapsed = elapsedMs(state.timer, now);
  const leadIn = leadInMs(state);
  if (state.done || step.kind !== 'set' || elapsed < leadIn) {
    return {...state, tempoMs: nextTempo};
  }
  const repsIn = Math.min(state.reps, (elapsed - leadIn) / state.tempoMs);
  return {
    ...state,
    tempoMs: nextTempo,
    timer: {
      accumulatedMs: leadIn + repsIn * nextTempo,
      startedAt: isRunning(state.timer) ? now : null,
    },
  };
}

/** Lowering reps below those already done ends the set on the next tick. */
export function setReps(state: WorkoutState, reps: number): WorkoutState {
  return {...state, reps: clampReps(reps)};
}

/** Formats as m:ss (or h:mm:ss), rounding up so a countdown shows 0:00 only at the end. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
