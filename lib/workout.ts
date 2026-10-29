// Interactive workout session logic. Timers are timestamp based so they stay
// accurate when the tab is backgrounded or the device sleeps.

/** A set as planned: for reps, or for a time. */
export type PlannedSet = {reps?: number | null; durationSec?: number | null};

/** A set as done in the workout. */
export type CompletedSet = {reps: number} | {durationSec: number};

/** Which exercise of a sequence a step is; its tempo applies to its sets. */
export type StepPart = {name: string; catalogId: string | null; tempoMs?: number};

/** A step of a sequence: one set of one exercise, with the break before it. */
export type SequencePlanStep = PlannedSet & {
  restSec?: number | null;
  part: StepPart;
};

/** How an exercise uses its sides: together, one then the other, or swapping every rep. */
export const SIDES = ['both', 'each', 'alternate'] as const;
export type Sides = (typeof SIDES)[number];

export const SIDES_LABELS: Record<Sides, string> = {
  both: 'Both sides together',
  each: 'One side, then the other',
  alternate: 'Alternating sides',
};

/** Stored sides as one of SIDES; anything else, or none, works both together. */
export function toSides(value: string | null | undefined): Sides {
  return SIDES.find((sides) => sides === value) ?? 'both';
}

/** Which side a step of a one-side-at-a-time exercise works. */
export type Side = 'left' | 'right';

/**
 * A calm step, like meditation, starts straight away with no lead-in. A set
 * done one side at a time is a left step then a right step; an alternating
 * step's reps are one on each side.
 */
type SideFields = {side?: Side; alternate?: boolean};
export type WorkoutStep =
  | ({kind: 'work'; durationMs: number; set: number; sets: number; part?: StepPart; calm?: boolean} & SideFields)
  | ({kind: 'set'; set: number; sets: number; reps: number; part?: StepPart; calm?: boolean} & SideFields)
  | {
      kind: 'rest';
      durationMs: number;
      nextSet: number;
      sets: number;
      next?: StepPart;
    };

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
  /** The left side of a set while the right is still to do. */
  leftSide?: CompletedSet | null;
};

export type WorkoutCue =
  | {type: 'leadIn'; n: number}
  | {type: 'go'}
  | {type: 'rep'; n: number}
  // An alternating set has no counts: each move cues its side; n reps done.
  | {type: 'side'; side: Side; n: number}
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

/** A rep set counts reps; a timed set counts down. */
function toWorkStep(
  planned: PlannedSet,
  set: number,
  sets: number,
): Exclude<WorkoutStep, {kind: 'rest'}> {
  return planned.reps != null
    ? {kind: 'set', set, sets, reps: clampReps(planned.reps)}
    : {
        kind: 'work',
        durationMs: Math.max(1, planned.durationSec ?? 60) * 1000,
        set,
        sets,
      };
}

/** Each set in turn, with rests between: rep sets count reps, timed sets count down. */
export function buildWorkoutSteps(
  planned: readonly PlannedSet[],
  restMs = DEFAULT_REST_MS,
): WorkoutStep[] {
  const sets = Math.max(1, planned.length);
  const list = planned.length > 0 ? planned : [{reps: 1}];
  return list
    .map((plannedSet, i): WorkoutStep[] => {
      const set = toWorkStep(plannedSet, i + 1, sets);
      return i === 0
        ? [set]
        : [{kind: 'rest', durationMs: restMs, nextSet: i + 1, sets}, set];
    })
    .flat();
}

/**
 * A sequence's steps in turn, each tagged with its exercise. A break comes
 * before a step only where one is planned; `set` counts the steps.
 */
export function buildSequenceSteps(
  planned: readonly SequencePlanStep[],
): WorkoutStep[] {
  const sets = planned.length;
  return planned.flatMap((step, i): WorkoutStep[] => {
    const work = {...toWorkStep(step, i + 1, sets), part: step.part};
    const restMs = Math.max(0, step.restSec ?? 0) * 1000;
    return i > 0 && restMs > 0
      ? [{kind: 'rest', durationMs: restMs, nextSet: i + 1, sets, next: step.part}, work]
      : [work];
  });
}

/**
 * Splits each set of an exercise done one side at a time into a left step and
 * a right step, and marks alternating ones. `sidesOf` says how each step's
 * exercise uses its sides.
 */
export function bySide(
  steps: readonly WorkoutStep[],
  sidesOf: (step: Exclude<WorkoutStep, {kind: 'rest'}>) => Sides,
): WorkoutStep[] {
  return steps.flatMap((step): WorkoutStep[] => {
    if (step.kind === 'rest') return [step];
    const sides = sidesOf(step);
    if (sides === 'alternate') return [{...step, alternate: true}];
    if (sides === 'each') {
      return [
        {...step, side: 'left'},
        {...step, side: 'right'},
      ];
    }
    return [step];
  });
}

/** The exercise a step is, or during a break the one coming next. */
export function stepPart(step: WorkoutStep): StepPart | undefined {
  return step.kind === 'rest' ? step.next : step.part;
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

/**
 * A sequence step that follows straight on from another, with no break,
 * starts at once. The second side of a set counts in, to allow a switch.
 */
export function leadInBeats(state: WorkoutState): number {
  const step = state.steps[state.index];
  if (step && step.kind !== 'rest' && step.calm) return 0;
  if (state.index === 0) return FIRST_LEAD_IN_BEATS;
  if (step?.kind !== 'rest' && step?.side === 'right') return LEAD_IN_BEATS;
  return state.steps[state.index - 1].kind === 'rest' ? LEAD_IN_BEATS : 0;
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
    tempoMs: clampTempo(
      options.tempoMs ??
        (firstSet?.kind === 'set' ? firstSet.part?.tempoMs : undefined) ??
        DEFAULT_TEMPO_MS,
    ),
    setsCompleted: 0,
    completed: [],
    leftSide: null,
  };
}

/** A set done one side at a time counts what both sides managed. */
function bothSides(left: CompletedSet, right: CompletedSet): CompletedSet {
  return 'reps' in left && 'reps' in right
    ? {reps: Math.min(left.reps, right.reps)}
    : 'durationSec' in left && 'durationSec' in right
      ? {durationSec: Math.min(left.durationSec, right.durationSec)}
      : right;
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
 * the plan keeps the same reps for the same exercise, as it did when every
 * set had to match.
 */
function repsFor(state: WorkoutState, index: number): number {
  const step = state.steps[index];
  if (step.kind !== 'set') return state.reps;
  const previous = state.steps
    .slice(0, index)
    .findLast((earlier) => earlier.kind === 'set');
  return previous?.kind === 'set' &&
    previous.reps === step.reps &&
    previous.part?.name === step.part?.name
    ? state.reps
    : step.reps;
}

/** A sequence's exercises each keep their own tempo. */
function tempoFor(state: WorkoutState, index: number): number {
  const step = state.steps[index];
  return step.kind === 'set' && step.part?.tempoMs
    ? clampTempo(step.part.tempoMs)
    : state.tempoMs;
}

/** Moves to the next step with its timer starting at `at`; finishes after the last step. */
export function nextStep(state: WorkoutState, at: number): WorkoutState {
  if (state.done) return state;
  const step = state.steps[state.index];
  const ended = finishedSet(state, at);
  // The left side is held until the right is done, so the set counts once.
  const leftSide = step.kind !== 'rest' && step.side === 'left' ? ended : null;
  const finished =
    leftSide || !ended
      ? null
      : state.leftSide
        ? bothSides(state.leftSide, ended)
        : ended;
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
      leftSide: null,
      timer: pauseTimer(state.timer, at),
      done: true,
    };
  }
  return {
    ...state,
    index,
    reps: repsFor(state, index),
    tempoMs: tempoFor(state, index),
    setsCompleted,
    completed,
    leftSide,
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
 * sounds when the set ends between ticks. An alternating set cues each move's
 * side instead of go and the counts. `key` is stable for a
 * beat so callers can play each cue once.
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
  const repsDone = beat - beats;
  if (step.kind === 'set' && step.alternate && repsDone >= 0) {
    return alternatingCue(state, beat, repsDone, startMs, elapsed);
  }
  const cue: WorkoutCue =
    beat < beats
      ? {type: 'leadIn', n: beats - beat}
      : beat === beats
        ? {type: 'go'}
        : {type: 'rep', n: repsDone};
  return {key: `${state.index}:${beat}`, cue, lateMs: elapsed - startMs};
}

/**
 * An alternating rep is a move on the left, then one on the right halfway
 * through. Once every rep is done it stays on the last move, so nothing more
 * sounds before the set ends.
 */
function alternatingCue(
  state: WorkoutState,
  beat: number,
  repsDone: number,
  startMs: number,
  elapsed: number,
) {
  const halfMs = state.tempoMs / 2;
  const [rep, side, moveMs] =
    repsDone >= state.reps
      ? [repsDone - 1, 'right' as const, startMs - halfMs]
      : elapsed >= startMs + halfMs
        ? [repsDone, 'right' as const, startMs + halfMs]
        : [repsDone, 'left' as const, startMs];
  const repBeat = beat - (repsDone - rep);
  return {
    key: `${state.index}:${repBeat}:${side}`,
    cue: {type: 'side', side, n: rep} satisfies WorkoutCue,
    lateMs: elapsed - moveMs,
  };
}

/**
 * The cue for a set that ended between two states, whether its reps ran out
 * or the user ended it early, including a sequence step going straight on to
 * the next. Skipped when catching up after the background has already carried
 * the workout past a break into the next set.
 */
export function setEndCue(
  previous: WorkoutState,
  next: WorkoutState,
): WorkoutCue | null {
  // Switching sides goes straight on to the other side's count-in.
  const ended = previous.steps[previous.index];
  if (
    ended.kind !== 'rest' &&
    ended.side === 'left' &&
    next.index === previous.index + 1
  ) {
    return {type: 'setEnd', lastSet: false};
  }
  if (next.setsCompleted <= previous.setsCompleted) return null;
  if (next.done) return {type: 'setEnd', lastSet: true};
  return next.steps[next.index].kind === 'rest' ||
    next.index === previous.index + 1
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
  // In a sequence the change is for this exercise (during a break, the next
  // one), so its later sets keep it and other exercises keep their own.
  const part = stepPart(step);
  const steps = part
    ? state.steps.map((later, i) =>
        i >= state.index && later.kind === 'set' && later.part?.name === part.name
          ? {...later, part: {...later.part, tempoMs: nextTempo}}
          : later,
      )
    : state.steps;
  if (state.done || step.kind !== 'set' || elapsed < leadIn) {
    return {...state, steps, tempoMs: nextTempo};
  }
  const repsIn = Math.min(state.reps, (elapsed - leadIn) / state.tempoMs);
  return {
    ...state,
    steps,
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

/**
 * What an exercise animation should show during a workout. In a set, each
 * rep's movement starts on its beat ("go" starts rep 1) and lasts one tempo;
 * `key` changes when a new rep starts, the tempo changes or the timer pauses
 * or resumes, so the player resyncs at most once per rep. It already moves
 * during the count-in, timed so a rep starts on "go".
 */
export type AnimationSync =
  | {cmd: 'sync'; repMs: number; repElapsedMs: number; playing: boolean}
  | {cmd: 'free'; playing: boolean}
  | {cmd: 'pose'};

export function animationSync(
  state: WorkoutState,
  now: number,
): {key: string; message: AnimationSync} {
  const step = state.steps[state.index];
  const elapsed = elapsedMs(state.timer, now);
  const playing = isRunning(state.timer);
  if (state.done) {
    return {key: `pose:${state.index}`, message: {cmd: 'pose'}};
  }
  // Rests keep it moving at its own tempo, as a reminder of the form; a
  // sequence's break shows the exercise coming next. Timed work has no reps,
  // so it keeps its own tempo too.
  if (step.kind === 'rest' || step.kind === 'work') {
    return {key: `free:${state.index}:${playing}`, message: {cmd: 'free', playing}};
  }
  // Negative during the count-in, so those beats count down to rep 0.
  const intoReps = elapsed - leadInMs(state);
  const rep = Math.floor(intoReps / state.tempoMs);
  if (rep >= state.reps) {
    return {key: `pose:${state.index}:end`, message: {cmd: 'pose'}};
  }
  // An alternating rep's animation loops a move on each side itself.
  return {
    key: `sync:${state.index}:${rep}:${state.tempoMs}:${playing}`,
    message: {
      cmd: 'sync',
      repMs: state.tempoMs,
      repElapsedMs: intoReps - rep * state.tempoMs,
      playing,
    },
  };
}
