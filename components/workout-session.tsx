'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Check,
  CircleHelp,
  Loader2,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  SkipForward,
  X,
} from 'lucide-react';
import {ExerciseAnimation, ExerciseAreas} from '@/components/exercise-animation';
import {GoalNotes} from '@/components/goal-notes';
import {Button} from '@/components/ui/button';
import {ProgressRing} from '@/components/ui/progress-ring';
import {Toggler, type TogglerOption} from '@/components/ui/toggler';
import type {PlannedExercise} from '@/components/todays-exercise-plan';
import {
  formatDuration,
  formatSetAmount,
  isRepSet,
  isSequence,
  isUniform,
  parseSequenceSteps,
  setsOf,
  type ExerciseSet,
  type SequenceStep,
} from '@/lib/exercise';
import {exerciseCatalog} from '@/lib/exercise-catalog';
import {
  DEFAULT_TEMPO_MS,
  leadInMs,
  MAX_REPS,
  MAX_TEMPO_MS,
  MIN_TEMPO_MS,
  REST_ADJUST_MS,
  TEMPO_STEP_MS,
  adjustRest,
  animationSync,
  buildSequenceSteps,
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
  stepPart,
  tickWorkout,
  togglePause,
  type AnimationSync,
  type CompletedSet,
  type WorkoutCue,
  type WorkoutState,
  type WorkoutStep,
} from '@/lib/workout';
import {
  createCalmMusic,
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
import {cn} from '@/lib/utils';

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

/** A built-in exercise's own rep time, to the stepper's step, else the app default. */
function defaultTempo(catalogId: string | null | undefined): number {
  const cycleMs = exerciseCatalog.get(catalogId)?.cycleMs;
  return cycleMs
    ? Math.round(cycleMs / TEMPO_STEP_MS) * TEMPO_STEP_MS
    : DEFAULT_TEMPO_MS;
}

function loadTempo(goal: PlannedExercise): number {
  return clampTempo(
    savedTempos.get(goal.id) ?? goal.tempoMs ?? defaultTempo(goal.catalogId),
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
 * Plays background music while enabled, following the workout's state:
 * gym beats, or a calm ambient track for exercises like meditation.
 * Returns the playing track's name.
 */
function useWorkoutMusic(
  enabled: boolean,
  playing: boolean,
  resting: boolean,
  calm: boolean,
) {
  const [music, setMusic] = useState<WorkoutMusic | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let created: WorkoutMusic | null = null;
    (calm ? createCalmMusic() : createWorkoutMusic())
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
  }, [enabled, calm]);

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
  /** On phones, the label above the buttons, to fit beside the timer. */
  stacked?: boolean;
};

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
  stacked,
}: StepperProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 py-1.5 pl-4 pr-2 md:py-2',
        stacked && 'max-md:flex-col max-md:gap-1 max-md:p-2',
      )}
    >
      <span
        className={cn(
          'text-sm font-medium',
          stacked && 'max-md:text-xs max-md:text-muted-foreground',
        )}
      >
        {label}
      </span>
      <div
        className={cn('flex items-center gap-1', stacked && 'max-md:w-full')}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('h-9 w-9', stacked && 'max-md:size-8')}
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={!canDecrement}
          onClick={onDecrement}
        >
          <Minus />
        </Button>
        <span
          className={cn(
            'w-20 whitespace-nowrap text-center text-sm font-semibold tabular-nums',
            // Beside the timer there's no room for a fixed width.
            stacked && 'max-md:w-auto max-md:min-w-0 max-md:flex-1',
          )}
        >
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('h-9 w-9', stacked && 'max-md:size-8')}
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
  stacked,
}: {
  tempoMs: number;
  onChange: (tempoMs: number) => void;
  stacked?: boolean;
}) {
  return (
    <Stepper
      label="Tempo"
      value={formatTempo(tempoMs)}
      onDecrement={() => onChange(tempoMs - TEMPO_STEP_MS)}
      onIncrement={() => onChange(tempoMs + TEMPO_STEP_MS)}
      canDecrement={tempoMs > MIN_TEMPO_MS}
      canIncrement={tempoMs < MAX_TEMPO_MS}
      stacked={stacked}
    />
  );
}

function RepsStepper({
  reps,
  onChange,
  stacked,
}: {
  reps: number;
  onChange: (reps: number) => void;
  stacked?: boolean;
}) {
  return (
    <Stepper
      label="Reps"
      value={`${reps} reps`}
      onDecrement={() => onChange(reps - 1)}
      onIncrement={() => onChange(reps + 1)}
      canDecrement={reps > 1}
      canIncrement={reps < MAX_REPS}
      stacked={stacked}
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
    // Strength exercises and sequences start from a setup screen.
    if (goal.type !== 'TIME') return null;
    // Timed work has no setup screen, so it starts with the saved choices.
    const prefs = loadPrefs();
    return {
      // Calm exercises never speak, so they needn't wait for the voice.
      voice: prefs.cues === 'voice' && !isCalmExercise(goal.catalogId),
      make: (startedAt) => ({
        ...prefs,
        initial: startWorkout(
          markCalm(buildWorkoutSteps(setsOf(goal)), goal.catalogId),
          startedAt,
        ),
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
      ) : isSequence(goal) ? (
        <SequenceSetup goal={goal} onStart={setWaiting} onCancel={onCancel} />
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

/**
 * A built-in exercise's animation beside the workout controls on wider
 * screens, so it's bigger and nothing scrolls, and above them on phones.
 * Just the controls for the user's own exercises.
 */
function WithAnimation({
  catalogId,
  sync,
  // Small enough above the controls on phones; as big as fits beside them on desktop.
  maxHeightClassName = '[&>*]:max-h-[min(30vh,15rem)] md:[&>*]:max-h-[min(70vh,30rem)]',
  dimmed,
  areasClassName,
  children,
}: {
  catalogId: string | null | undefined;
  sync: {key: string; message: AnimationSync};
  maxHeightClassName?: string;
  dimmed?: boolean;
  areasClassName?: string;
  children: ReactNode;
}) {
  const entry = exerciseCatalog.get(catalogId);
  if (!entry) return children;
  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:items-center md:gap-8">
      <div className="space-y-2">
        <ExerciseAnimation
          // A sequence moves on to other exercises, each with its own scene.
          key={entry.id}
          entry={entry}
          sync={sync}
          className="mx-auto max-w-sm md:max-w-none"
          maxHeightClassName={maxHeightClassName}
          dimmed={dimmed}
        />
        <ExerciseAreas entry={entry} className={cn('text-center', areasClassName)} />
      </div>
      {children}
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
        initial: startWorkout(markCalm(buildWorkoutSteps(planned), goal.catalogId), startedAt, {
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

  // Previews a rep at the chosen tempo, so changing it shows the pace.
  return (
    <WithAnimation
      catalogId={goal.catalogId}
      dimmed
      sync={{
        key: `preview:${tempoMs}`,
        message: {
          cmd: 'sync',
          repMs: tempoMs,
          repElapsedMs: 0,
          playing: true,
        },
      }}
    >
      <div className="space-y-4">
        <SoundControls
          cues={prefs.cues}
          onCuesChange={(cues) => setPrefs({...prefs, cues})}
          music={prefs.music}
          onMusicToggle={() => setPrefs({...prefs, music: !prefs.music})}
          hideCues={isCalmExercise(goal.catalogId)}
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
    </WithAnimation>
  );
}

function isCalmExercise(catalogId: string | null | undefined): boolean {
  return exerciseCatalog.get(catalogId)?.music === 'calm';
}

/** Calm exercises, like meditation, start straight away with no countdown. */
function markCalm(steps: WorkoutStep[], goalCatalogId: string | null | undefined) {
  return steps.map((step) =>
    step.kind !== 'rest' && isCalmExercise(stepPart(step)?.catalogId ?? goalCatalogId)
      ? {...step, calm: true}
      : step,
  );
}

/** The sequence's steps in order, each with its own exercise's tempo. */
function sequencePlan(steps: readonly SequenceStep[]) {
  return steps.map((step) => ({
    ...step,
    part: {
      name: step.name,
      catalogId: step.catalogId ?? null,
      tempoMs: defaultTempo(step.catalogId),
    },
  }));
}

function SequenceSetup({
  goal,
  onStart,
  onCancel,
}: {
  goal: PlannedExercise;
  onStart: (pending: Pending) => void;
  onCancel: () => void;
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [steps] = useState(() => parseSequenceSteps(goal.steps) ?? []);
  // The step whose animation is shown: the first, until another is picked.
  const [shown, setShown] = useState(0);

  function start() {
    savePrefs(prefs);
    // Made in the tap, not once the voice loads: iOS only unlocks audio here.
    const sound = createWorkoutSound();
    onStart({
      voice: prefs.cues === 'voice',
      make: (startedAt) => ({
        ...prefs,
        initial: startWorkout(
          markCalm(buildSequenceSteps(sequencePlan(steps)), goal.catalogId),
          startedAt,
        ),
        sound,
      }),
    });
  }

  useEffect(() => {
    if (prefs.music) void preloadWorkoutMusic().catch(() => {});
  }, [prefs.music]);

  // Previews the first exercise, which the sequence starts with, or the one picked.
  return (
    <WithAnimation
      catalogId={steps[shown]?.catalogId}
      dimmed
      sync={{key: 'preview', message: {cmd: 'free', playing: true}}}
    >
      <div className="space-y-4">
        <SoundControls
          cues={prefs.cues}
          onCuesChange={(cues) => setPrefs({...prefs, cues})}
          music={prefs.music}
          onMusicToggle={() => setPrefs({...prefs, music: !prefs.music})}
        />
        <SequencePlanTable
          steps={steps}
          lastWeek={goal.lastWeekSets}
          shown={shown}
          onShow={setShown}
        />
        <Button
          className="h-12 w-full"
          disabled={steps.length === 0}
          onClick={start}
        >
          <Play />
          Start {steps.length} {steps.length === 1 ? 'step' : 'steps'}
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={onCancel}>
          <X />
          Cancel
        </Button>
      </div>
    </WithAnimation>
  );
}

/** Cues and music: side by side on wider screens, stacked on phones. */
function SoundControls({
  cues,
  onCuesChange,
  music,
  onMusicToggle,
  trackName,
  hideCues,
}: {
  cues: Cues;
  onCuesChange: (cues: Cues) => void;
  music: boolean;
  onMusicToggle: () => void;
  /** The track playing, shown in place of "Music on". */
  trackName?: string;
  /** Calm exercises have no counts to cue, so only music is offered. */
  hideCues?: boolean;
}) {
  const name = useId();
  return (
    <div className={cn('grid w-full gap-2', !hideCues && 'grid-cols-2')}>
      {!hideCues && (
        <Toggler
          name={name}
          label="Cues"
          options={CUE_OPTIONS}
          value={cues}
          onChange={onCuesChange}
        />
      )}
      <Button
        type="button"
        variant={music ? 'default' : 'outline'}
        aria-pressed={music}
        onClick={onMusicToggle}
        className="min-w-0"
      >
        <Music />
        <span className="truncate">
          {trackName ? `Music: ${trackName}` : `Music ${music ? 'on' : 'off'}`}
        </span>
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

/**
 * A sequence's steps with the breaks between, beside last week's when logged.
 * Built-in exercises have a How to button that shows their animation.
 */
function SequencePlanTable({
  steps,
  lastWeek,
  shown,
  onShow,
}: {
  steps: readonly SequenceStep[];
  lastWeek?: readonly ExerciseSet[] | null;
  /** The step whose animation is showing. */
  shown: number;
  onShow: (index: number) => void;
}) {
  const previous = lastWeek?.length ? lastWeek : null;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-1.5 pr-2 text-left font-medium">
              #
            </th>
            <th scope="col" className="pb-1.5 text-left font-medium">
              Exercise
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Target
            </th>
            {previous ? (
              <th scope="col" className="pb-1.5 pl-2 text-right font-medium">
                Last week
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            <Fragment key={index}>
              {step.restSec > 0 ? (
                <tr className="border-t border-border/40 text-xs text-muted-foreground">
                  <td colSpan={previous ? 4 : 3} className="py-1 text-center">
                    Break {formatDuration(step.restSec)}
                  </td>
                </tr>
              ) : null}
              <tr className="border-t border-border/40">
                <th
                  scope="row"
                  className="py-1.5 pr-2 text-left font-medium text-muted-foreground"
                >
                  {index + 1}
                </th>
                <td className="py-1.5 text-left">
                  <div className="flex items-center gap-1">
                    <span className="min-w-0">{step.name}</span>
                    {exerciseCatalog.get(step.catalogId) ? (
                      <Button
                        type="button"
                        variant={index === shown ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 shrink-0 px-2"
                        aria-label={`How to do ${step.name}`}
                        aria-pressed={index === shown}
                        onClick={() => onShow(index)}
                      >
                        <CircleHelp />
                        <span className="max-sm:hidden">How to</span>
                      </Button>
                    ) : null}
                  </div>
                </td>
                <td className="py-1.5 text-right font-semibold">
                  <SetPair set={step} />
                </td>
                {previous ? (
                  <td className="py-1.5 pl-2 text-right text-muted-foreground">
                    <SetPair set={previous[index]} />
                  </td>
                ) : null}
              </tr>
            </Fragment>
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

function stepLabel(step: WorkoutStep): string | null {
  if (step.kind === 'rest') return step.next ? 'Break' : 'Rest';
  if (step.part) return step.part.name;
  // A single timed set is the whole workout, already named in the title.
  if (step.kind === 'work' && step.sets === 1) return null;
  return `Set ${step.set} of ${step.sets}`;
}

function stepDetail(
  step: WorkoutStep,
  state: WorkoutState,
  goal: PlannedExercise,
): string | null {
  if (step.kind === 'rest') {
    if (!step.next) return `Next: set ${step.nextSet} of ${step.sets}`;
    const following = state.steps[state.index + 1];
    const next = `Next: Step ${step.nextSet} of ${step.sets} · ${step.next.name}`;
    return following && following.kind !== 'rest'
      ? `${next} · ${stepAmount(following, following.kind === 'set' ? following.reps : 0)}`
      : next;
  }
  const position = step.part ? `Step ${step.set} of ${step.sets}` : null;
  // The timer already shows how long timed work runs.
  if (step.kind === 'work') return position;
  const sets = setsOf(goal);
  const {weight} = sets[step.set - 1] ?? sets[sets.length - 1];
  const amount = stepAmount(step, state.reps);
  const detail = weight ? `${amount} @ ${weight}` : amount;
  return position ? `${position} · ${detail}` : detail;
}

function stepAmount(step: Exclude<WorkoutStep, {kind: 'rest'}>, reps: number) {
  return step.kind === 'set'
    ? `${reps} reps`
    : formatDuration(Math.round(step.durationMs / 1000));
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
    isCalmExercise(stepPart(step)?.catalogId ?? goal.catalogId),
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
      // With no count-in, the previous step's end tone already marks the start.
      if (cue.cue.type === 'go' && leadInBeats(current) === 0) return;
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
      const straightOn = !next.done && next.steps[next.index].kind !== 'rest';
      const endSound = endCue && cueSound(endCue, cues, musicOn);
      // "And rest" would be wrong with no break, so going straight on is a tone,
      // and a calm exercise like meditation ends quietly on the finish tone.
      const ended = previous.steps[previous.index];
      const calmEnd = ended.kind !== 'rest' && ended.calm;
      const endMode = (straightOn || calmEnd) && endSound ? 'tones' : endSound;
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
    // A sequence's tempos are per exercise, so they last for this run only.
    if (!isSequence(goal)) saveTempo(goal.id, tempoMs);
    advance((current, time) => setTempo(current, tempoMs, time));
  }

  const following = state.steps[state.index + 1];
  // During a break, tempo is shown for the exercise coming next.
  const restTempo =
    (following?.kind === 'set' && following.part?.tempoMs) || state.tempoMs;

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

  // Tighter on phones, so the animation and every control fit on one screen.
  const controls = (
    <div className="flex flex-col items-center gap-3 md:gap-6">
      <div className="text-center" aria-live="polite">
        {stepLabel(step) && (
          <p data-testid="step-label" className="text-xl font-semibold md:text-lg">
            {stepLabel(step)}
          </p>
        )}
        {stepDetail(step, state, goal) && (
          <p data-testid="step-detail" className="text-base text-muted-foreground md:text-sm">
            {stepDetail(step, state, goal)}
          </p>
        )}
      </div>

      {/* On phones, tempo and reps sit beside the timer rather than below it. */}
      <div className="flex w-full items-center justify-center gap-3 md:flex-col md:gap-6">
        <ProgressRing
          value={progress}
          strokeWidth={5}
          className="size-32 min-[380px]:size-36 md:size-52"
          indicatorClassName={
            step.kind === 'rest' ? 'text-sky-500' : 'text-primary'
          }
        >
          <span
            role="timer"
            className="text-4xl font-semibold tabular-nums tracking-tight md:text-5xl"
          >
            {display}
          </span>
          <span className="mt-1 h-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {running ? caption : 'Paused'}
          </span>
        </ProgressRing>
        {(inSet || step.kind === 'rest') && (
          <div className="min-w-0 flex-1 md:w-full md:flex-none">
            {inSet && (
              <div className="w-full space-y-2">
                <TempoStepper
                  tempoMs={state.tempoMs}
                  onChange={changeTempo}
                  stacked
                />
                <RepsStepper
                  reps={state.reps}
                  onChange={(reps) =>
                    advance((current) => setReps(current, reps))
                  }
                  stacked
                />
              </div>
            )}

            {step.kind === 'rest' && (
              <div className="w-full space-y-2 md:space-y-3">
                {/* Rest is when tempo usually gets tuned, ready for the next set. */}
                {following?.kind === 'set' && (
                  <TempoStepper
                    tempoMs={restTempo}
                    onChange={changeTempo}
                    stacked
                  />
                )}
                <div className="grid grid-cols-2 gap-2 md:gap-3">
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
          </div>
        )}
      </div>

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
            ? step.next
              ? 'Skip break'
              : 'Skip rest'
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
        hideCues={isCalmExercise(goal.catalogId)}
      />

      <Button variant="ghost" size="sm" onClick={cancel}>
        <X />
        Cancel without logging
      </Button>
    </div>
  );
  return (
    <WithAnimation
      catalogId={stepPart(step)?.catalogId ?? goal.catalogId}
      sync={animationSync(state, now)}
      dimmed={step.kind === 'rest' && !state.done}
      // Phones need the room for the animation and controls.
      areasClassName="max-md:hidden"
      // On phones the animation gets whatever height the controls leave.
      maxHeightClassName="[&>*]:max-h-[clamp(4rem,calc(100dvh_-_32rem),24rem)] md:[&>*]:max-h-[min(70vh,30rem)]"
    >
      {controls}
    </WithAnimation>
  );
}
