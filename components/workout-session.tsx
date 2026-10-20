'use client';

import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {
  Check,
  Loader2,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  SkipForward,
  X,
} from 'lucide-react';
import {GoalNotes} from '@/components/goal-notes';
import {Button} from '@/components/ui/button';
import {ProgressRing} from '@/components/ui/progress-ring';
import {Toggler, type TogglerOption} from '@/components/ui/toggler';
import type {PlannedExercise} from '@/components/todays-exercise-plan';
import {
  formatDuration,
  formatExerciseDetail,
  formatSetAmount,
  isRepSet,
  isUniform,
  setsOf,
  type ExerciseSet,
} from '@/lib/exercise';
import {
  DEFAULT_TEMPO_MS,
  leadInMs,
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
  leadInBeats,
  nextStep,
  remainingMs,
  setEndCue,
  setReps,
  setTempo,
  startWorkout,
  tickWorkout,
  togglePause,
  type CompletedSet,
  type WorkoutCue,
  type WorkoutState,
  type WorkoutStep,
} from '@/lib/workout';
import {
  createWorkoutMusic,
  preloadWorkoutMusic,
  type WorkoutMusic,
} from '@/lib/workout-music';
import {
  createWorkoutSound,
  loadWorkoutVoice,
  unlockAudio,
  type SoundMode,
  type WorkoutSound,
} from '@/lib/workout-sound';

/** Reps of each set done, in order. */
export type WorkoutResult = {sets: CompletedSet[]};

// Sets tick faster so rep cues land close to the beat.
const SET_TICK_MS = 50;
const TICK_MS = 250;
// Cues this late (e.g. after returning from the background) are skipped.
const MAX_CUE_LATE_MS = 400;
const PREFS_KEY = 'clearcalorie:workout-prefs';

/** How set cues sound; with them off, only the music plays. */
type Cues = SoundMode | 'off';

const CUE_OPTIONS: TogglerOption<Cues>[] = [
  {value: 'voice', label: 'Voice'},
  {value: 'tones', label: 'Tones'},
  {value: 'off', label: 'Off'},
];

type WorkoutPrefs = {cues: Cues; music: boolean};

/**
 * How a cue sounds, or null for silence. With cues off but music on, tones
 * still mark the count-in and each set's start and end, just not every rep.
 */
function cueSound(cue: WorkoutCue, cues: Cues, music: boolean): SoundMode | null {
  if (cues !== 'off') return cues;
  return music && cue.type !== 'rep' ? 'tones' : null;
}

function loadPrefs(): WorkoutPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    const cues = CUE_OPTIONS.find((option) => option.value === saved?.cues);
    return {
      // Older prefs saved a mode of "tones" or "count".
      cues: cues?.value ?? (saved?.mode === 'tones' ? 'tones' : 'voice'),
      music: saved?.music === true,
    };
  } catch {
    return {cues: 'voice', music: false};
  }
}

function savePrefs(prefs: WorkoutPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

// Tempos saved since the page loaded, so a rerun doesn't use the stale prop.
const savedTempos = new Map<string, number>();

function loadTempo(goal: PlannedExercise): number {
  return clampTempo(
    savedTempos.get(goal.id) ?? goal.tempoMs ?? DEFAULT_TEMPO_MS,
  );
}

/** Remembers the tempo on the goal so it follows the user across devices. */
function saveTempo(goalId: string, tempoMs: number) {
  const value = clampTempo(tempoMs);
  if (savedTempos.get(goalId) === value) return;
  savedTempos.set(goalId, value);
  void fetch('/api/exercise-goals', {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: goalId, tempoMs: value}),
    keepalive: true,
  }).catch(() => {});
}

function formatTempo(tempoMs: number) {
  return `${tempoMs / 1000} s / rep`;
}

/**
 * Plays background music while enabled, following the workout's state.
 * Returns the playing track's name.
 */
function useWorkoutMusic(enabled: boolean, playing: boolean, resting: boolean) {
  const [music, setMusic] = useState<WorkoutMusic | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let created: WorkoutMusic | null = null;
    createWorkoutMusic()
      .then((instance) => {
        if (cancelled) return instance.dispose();
        created = instance;
        setMusic(instance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      created?.dispose();
      setMusic(null);
    };
  }, [enabled]);

  useEffect(() => {
    music?.setPlaying(playing);
  }, [music, playing]);

  useEffect(() => {
    music?.setIntensity(resting ? 'rest' : 'set');
  }, [music, resting]);

  return playing ? music?.name : undefined;
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

type Session = WorkoutPrefs & {
  initial: WorkoutState;
  sound: WorkoutSound | null;
};

/** Builds a session whose timer starts at startedAt. */
type MakeSession = (startedAt: number) => Session;

/** A session about to start; with voice on it waits for the clips to load. */
type Pending = {make: MakeSession; voice: boolean};

type WorkoutSessionProps = {
  goal: PlannedExercise;
  /** Created in the Start tap for time goals; strength goals make their own. */
  sound: WorkoutSound | null;
  onComplete: (result?: WorkoutResult) => void;
  onCancel: () => void;
  /** Called when notes are saved mid-workout, so the review can show them. */
  onNotesSaved?: (notes: string | null) => void;
};

export function WorkoutSession({
  goal,
  sound,
  onComplete,
  onCancel,
  onNotesSaved,
}: WorkoutSessionProps) {
  const [session, setSession] = useState<Session | null>(null);
  // A spoken workout waits here until every voice clip has loaded, so the
  // timer never runs ahead of a count that can't be said yet.
  const [waiting, setWaiting] = useState<Pending | null>(() => {
    if (goal.type === 'STRENGTH') return null;
    // Timed work has no setup screen, so it starts with the saved choices.
    const prefs = loadPrefs();
    return {
      voice: prefs.cues === 'voice',
      make: (startedAt) => ({
        ...prefs,
        initial: startWorkout(buildWorkoutSteps(setsOf(goal)), startedAt),
        sound,
      }),
    };
  });

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    const ready = waiting.voice ? loadWorkoutVoice() : Promise.resolve();
    void ready.then(() => {
      if (cancelled) return;
      setWaiting(null);
      setSession(waiting.make(Date.now()));
    });
    return () => {
      cancelled = true;
    };
  }, [waiting]);

  // One notes box across every phase, so setup edits carry into the sets.
  return (
    <div className="space-y-6">
      {waiting ? (
        waiting.voice && <LoadingVoice onCancel={onCancel} />
      ) : session ? (
        <ActiveWorkout
          goal={goal}
          session={session}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      ) : (
        <StrengthSetup goal={goal} onStart={setWaiting} onCancel={onCancel} />
      )}
      <GoalNotes
        goalId={goal.id}
        initialNotes={goal.notes}
        onSaved={onNotesSaved}
      />
    </div>
  );
}

function LoadingVoice({onCancel}: {onCancel: () => void}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p role="status" className="text-sm text-muted-foreground">
        Loading voice…
      </p>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        <X />
        Cancel
      </Button>
    </div>
  );
}

function StrengthSetup({
  goal,
  onStart,
  onCancel,
}: {
  goal: PlannedExercise;
  onStart: (pending: Pending) => void;
  onCancel: () => void;
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [tempoMs, setTempoMs] = useState(() => loadTempo(goal));
  const [planned] = useState(() => setsOf(goal));
  // Reps can be set for the whole workout only when every set is the same.
  const sameSets = isUniform(planned);
  const [reps, setRepsValue] = useState(() =>
    clampReps(planned.find(isRepSet)?.reps ?? 10),
  );

  function start() {
    savePrefs(prefs);
    saveTempo(goal.id, tempoMs);
    // Made in the tap, not once the voice loads: iOS only unlocks audio here.
    const sound = createWorkoutSound();
    onStart({
      voice: prefs.cues === 'voice',
      make: (startedAt) => ({
        ...prefs,
        initial: startWorkout(buildWorkoutSteps(planned), startedAt, {
          reps: sameSets ? reps : undefined,
          tempoMs,
        }),
        sound,
      }),
    });
  }

  useEffect(() => {
    if (prefs.music) void preloadWorkoutMusic().catch(() => {});
  }, [prefs.music]);

  return (
    <div className="space-y-4">
      <SoundControls
        cues={prefs.cues}
        onCuesChange={(cues) => setPrefs({...prefs, cues})}
        music={prefs.music}
        onMusicToggle={() => setPrefs({...prefs, music: !prefs.music})}
      />
      <TempoStepper
        tempoMs={tempoMs}
        onChange={(value) => setTempoMs(clampTempo(value))}
      />
      {/* Sets that differ are shown in the target; each can be changed when logging. */}
      {sameSets ? (
        <RepsStepper
          reps={reps}
          onChange={(value) => setRepsValue(clampReps(value))}
        />
      ) : null}
      {/* Weight is changed when logging, so here it is only shown. */}
      <SetPlanTable target={planned} lastWeek={goal.lastWeekSets} />
      <Button className="h-12 w-full" onClick={start}>
        <Play />
        Start {planned.length} {planned.length === 1 ? 'set' : 'sets'}
      </Button>
      <Button variant="ghost" size="sm" className="w-full" onClick={onCancel}>
        <X />
        Cancel
      </Button>
    </div>
  );
}

/** Cues and music: side by side on wider screens, stacked on phones. */
function SoundControls({
  cues,
  onCuesChange,
  music,
  onMusicToggle,
  trackName,
}: {
  cues: Cues;
  onCuesChange: (cues: Cues) => void;
  music: boolean;
  onMusicToggle: () => void;
  /** The track playing, shown in place of "Music on". */
  trackName?: string;
}) {
  return (
    <div className="grid w-full gap-2 sm:grid-cols-2">
      <Toggler
        name={useId()}
        label="Cues"
        options={CUE_OPTIONS}
        value={cues}
        onChange={onCuesChange}
      />
      <Button
        type="button"
        variant={music ? 'default' : 'outline'}
        aria-pressed={music}
        onClick={onMusicToggle}
      >
        <Music />
        {trackName ? `Music: ${trackName}` : `Music ${music ? 'on' : 'off'}`}
      </Button>
    </div>
  );
}

/**
 * The planned sets, one row each, beside last week's when there was a log.
 * Read-only: sets are changed when logging.
 */
function SetPlanTable({
  target,
  lastWeek,
}: {
  target: readonly ExerciseSet[];
  lastWeek?: readonly ExerciseSet[] | null;
}) {
  const previous = lastWeek?.length ? lastWeek : null;
  const rows = Math.max(target.length, previous?.length ?? 0);
  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-1.5 text-left font-medium">
              Set
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Target
            </th>
            {previous ? (
              <th scope="col" className="pb-1.5 text-right font-medium">
                Last week
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {Array.from({length: rows}, (_, index) => (
            <tr key={index} className="border-t border-border/40">
              <th
                scope="row"
                className="py-1.5 text-left font-medium text-muted-foreground"
              >
                {index + 1}
              </th>
              <td className="py-1.5 text-right font-semibold">
                <SetPair set={target[index]} />
              </td>
              {previous ? (
                <td className="py-1.5 text-right text-muted-foreground">
                  <SetPair set={previous[index]} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A set's reps (or time) and weight, e.g. "10 × 20 kg"; "—" if missing. */
function SetPair({set}: {set: ExerciseSet | undefined}) {
  if (!set) return '—';
  const amount = formatSetAmount(set);
  if (!set.weight) return amount;
  return (
    <>
      {amount}
      <span className="px-1 font-normal text-muted-foreground">×</span>
      {set.weight}
      <span className="font-normal text-muted-foreground"> kg</span>
    </>
  );
}

function stepLabel(step: WorkoutStep): string {
  if (step.kind === 'rest') return 'Rest';
  // A single timed set is the whole workout.
  if (step.kind === 'work' && step.sets === 1) return 'Workout';
  return `Set ${step.set} of ${step.sets}`;
}

function stepDetail(
  step: WorkoutStep,
  state: WorkoutState,
  goal: PlannedExercise,
): string {
  if (step.kind === 'rest') return `Next: set ${step.nextSet} of ${step.sets}`;
  if (step.kind === 'work' && step.sets === 1) {
    return formatExerciseDetail(goal);
  }
  const amount =
    step.kind === 'set'
      ? `${state.reps} reps`
      : formatDuration(Math.round(step.durationMs / 1000));
  const sets = setsOf(goal);
  const {weight} = sets[step.set - 1] ?? sets[sets.length - 1];
  return weight ? `${amount} @ ${weight}` : amount;
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
  const {initial, sound} = session;
  const [state, setState] = useState(initial);
  const [cues, setCues] = useState(session.cues);
  const [musicOn, setMusicOn] = useState(session.music);
  const [now, setNow] = useState(() => initial.timer.startedAt ?? 0);
  const stateRef = useRef(initial);
  const lastCueKey = useRef<string | null>(null);
  const completed = useRef(false);

  const step = state.steps[state.index];
  const running = isRunning(state.timer) && !state.done;
  const inSet = step.kind === 'set';
  const leadingIn =
    step.kind !== 'rest' && elapsedMs(state.timer, now) < leadInMs(state);

  useWakeLock(!state.done);
  // Music loads during the first countdown and kicks in once it's done.
  const firstCountdown = state.index === 0 && leadingIn;
  const trackName = useWorkoutMusic(
    musicOn,
    running && !firstCountdown,
    step.kind === 'rest',
  );

  function toggleMusic() {
    unlockAudio();
    setMusicOn(!musicOn);
    savePrefs({...loadPrefs(), music: !musicOn});
  }

  function changeCues(next: Cues) {
    unlockAudio();
    // Cues whose clips are still loading chime until they're ready.
    if (next === 'voice') void loadWorkoutVoice();
    else sound?.stop();
    setCues(next);
    savePrefs({...loadPrefs(), cues: next});
  }

  const playCue = useCallback(
    (current: WorkoutState, time: number) => {
      const cue = currentCue(current, time);
      if (!cue || cue.key === lastCueKey.current) return;
      lastCueKey.current = cue.key;
      const mode = cueSound(cue.cue, cues, musicOn);
      if (mode && cue.lateMs <= MAX_CUE_LATE_MS) {
        sound?.play(cue.cue, mode, current.tempoMs, leadInBeats(current));
      }
    },
    [sound, cues, musicOn],
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
      const endMode = endCue && cueSound(endCue, cues, musicOn);
      if (endCue && endMode) {
        sound?.play(endCue, endMode, next.tempoMs, leadInBeats(next));
      }
      stateRef.current = next;
      setState(next);
      setNow(time);
    },
    [playCue, sound, cues, musicOn],
  );

  useEffect(() => {
    if (!running) return;
    const fast = inSet || leadingIn;
    const id = setInterval(() => advance(), fast ? SET_TICK_MS : TICK_MS);
    return () => clearInterval(id);
  }, [running, inSet, leadingIn, advance]);

  // A countdown clip runs ahead of the timer, so it must stop when the timer
  // does. Finishing doesn't count: "Great work" plays as the workout ends.
  const paused = !isRunning(state.timer) && !state.done;
  useEffect(() => {
    if (paused) sound?.stop();
  }, [paused, sound]);
  useEffect(() => () => sound?.endCountdown(), [sound]);

  function cancel() {
    sound?.stop();
    onCancel();
  }

  useEffect(() => {
    if (!state.done || completed.current) return;
    completed.current = true;
    onComplete({sets: state.completed});
  }, [state.done, state.completed, onComplete]);

  function changeTempo(tempoMs: number) {
    saveTempo(goal.id, tempoMs);
    advance((current, time) => setTempo(current, tempoMs, time));
  }

  const cue = currentCue(state, now)?.cue;
  const isLastStep = state.index === state.steps.length - 1;
  const progress = inSet
    ? cue?.type === 'rep'
      ? (100 * cue.n) / state.reps
      : 0
    : step.kind === 'work'
      ? (100 * Math.max(0, elapsedMs(state.timer, now) - leadInMs(state))) /
        step.durationMs
      : (100 * elapsedMs(state.timer, now)) / currentStepDurationMs(state);

  let display = formatClock(remainingMs(state, now));
  let caption = 'Remaining';
  if (cue?.type === 'leadIn') {
    display = String(cue.n);
    caption = 'Get ready';
  } else if (cue?.type === 'go' && inSet) {
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
        <div className="w-full space-y-3">
          {/* Rest is when tempo usually gets tuned, ready for the next set. */}
          {state.steps[state.index + 1]?.kind === 'set' && (
            <TempoStepper tempoMs={state.tempoMs} onChange={changeTempo} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              // Cutting a rest past its end would start the next set in the past.
              disabled={remainingMs(state, now) <= REST_ADJUST_MS}
              onClick={() =>
                advance((current, time) =>
                  remainingMs(current, time) > REST_ADJUST_MS
                    ? adjustRest(current, -REST_ADJUST_MS)
                    : current,
                )
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
            : !isLastStep
              ? 'Done'
              : 'Finish'}
        </Button>
      </div>

      <SoundControls
        cues={cues}
        onCuesChange={changeCues}
        music={musicOn}
        onMusicToggle={toggleMusic}
        trackName={trackName}
      />

      <Button variant="ghost" size="sm" onClick={cancel}>
        <X />
        Cancel without logging
      </Button>
    </div>
  );
}
