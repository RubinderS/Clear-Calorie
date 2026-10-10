'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {
  Check,
  Loader2,
  Minus,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  SkipForward,
  X,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {ProgressRing} from '@/components/ui/progress-ring';
import type {PlannedExercise} from '@/components/todays-exercise-plan';
import {EXERCISE_NOTES_MAX, formatExerciseDetail} from '@/lib/exercise';
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

type WorkoutPrefs = {mode: SoundMode; music: boolean};

function loadPrefs(): WorkoutPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    return {
      mode: saved?.mode === 'count' ? 'count' : 'tones',
      music: saved?.music === true,
    };
  } catch {
    return {mode: 'tones', music: false};
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

function saveNotes(goalId: string, notes: string) {
  return fetch('/api/exercise-goals', {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: goalId, notes}),
  });
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
// Sentence punctuation after a URL isn't part of it.
const URL_TRAILING = /[.,;:!?)\]}'"]+$/;

/** Renders text with any URLs as links that open in a new tab. */
function Linkified({text}: {text: string}) {
  return text.split(URL_PATTERN).map((part, index) => {
    // split() with a capture group puts the matches at odd indexes.
    if (index % 2 === 0) return part;
    const trailing = part.match(URL_TRAILING)?.[0] ?? '';
    const url = part.slice(0, part.length - trailing.length);
    return (
      <span key={index}>
        <a
          href={url.startsWith('www.') ? `https://${url}` : url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2"
        >
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}

/** Goal notes, shown as text with links; Edit switches to a textarea. */
function WorkoutNotes({goal}: {goal: PlannedExercise}) {
  const router = useRouter();
  const [notes, setNotes] = useState(goal.notes ?? '');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    setError(false);
    try {
      const response = await saveNotes(goal.id, draft);
      if (!response.ok) throw new Error();
      setNotes(draft.trim());
      setDraft(null);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const inputId = `workoutNotes-${goal.id}`;
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between gap-2">
        {draft === null ? (
          <h3 className="text-sm font-medium">Notes</h3>
        ) : (
          <Label htmlFor={inputId}>Notes</Label>
        )}
        {draft === null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDraft(notes)}
          >
            <Pencil />
            {notes ? 'Edit' : 'Add'}
          </Button>
        )}
      </div>
      {draft === null ? (
        notes ? (
          <p className="whitespace-pre-line break-words rounded-xl border border-border/50 bg-muted/30 px-4 py-2 text-sm">
            <Linkified text={notes} />
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )
      ) : (
        <>
          <textarea
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={EXERCISE_NOTES_MAX}
            rows={3}
            autoFocus
            placeholder="Add notes for this exercise"
            className="w-full rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setError(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          Couldn&apos;t save notes. Try again.
        </p>
      )}
    </div>
  );
}

function formatTempo(tempoMs: number) {
  return `${tempoMs / 1000} s / rep`;
}

/** Plays background music while enabled, following the workout's state. */
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
  music: boolean;
};

/** Builds a session whose timer starts at startedAt. */
type MakeSession = (startedAt: number) => Session;

type WorkoutSessionProps = {
  goal: PlannedExercise;
  /** Created in the Start tap for time goals; strength goals make their own. */
  sound: WorkoutSound | null;
  onComplete: (result?: WorkoutResult) => void;
  onCancel: () => void;
};

export function WorkoutSession({
  goal,
  sound,
  onComplete,
  onCancel,
}: WorkoutSessionProps) {
  const [session, setSession] = useState<Session | null>(null);
  // A spoken workout waits here until every voice clip has loaded, so the
  // timer never runs ahead of a count that can't be said yet.
  const [waiting, setWaiting] = useState<{make: MakeSession} | null>(() =>
    goal.type === 'STRENGTH'
      ? null
      : {
          make: (startedAt) => ({
            initial: startWorkout(buildWorkoutSteps(goal), startedAt),
            // Timed work only has the lead-in, so speak "5, 4, 3, 2, 1, Go".
            mode: 'count',
            sound,
            music: loadPrefs().music,
          }),
        },
  );

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    void loadWorkoutVoice().then(() => {
      if (cancelled) return;
      setWaiting(null);
      setSession(waiting.make(Date.now()));
    });
    return () => {
      cancelled = true;
    };
  }, [waiting]);

  function start(mode: SoundMode, make: MakeSession) {
    if (mode === 'count') setWaiting({make});
    else setSession(make(Date.now()));
  }

  // One notes box across every phase, so setup edits carry into the sets.
  return (
    <div className="space-y-6">
      {waiting ? (
        <LoadingVoice onCancel={onCancel} />
      ) : session ? (
        <ActiveWorkout
          goal={goal}
          session={session}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      ) : (
        <StrengthSetup goal={goal} onStart={start} onCancel={onCancel} />
      )}
      <WorkoutNotes goal={goal} />
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
  onStart: (mode: SoundMode, make: MakeSession) => void;
  onCancel: () => void;
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [tempoMs, setTempoMs] = useState(() => loadTempo(goal));
  const [reps, setRepsValue] = useState(() => clampReps(goal.reps ?? 10));

  function start() {
    savePrefs(prefs);
    saveTempo(goal.id, tempoMs);
    // Made in the tap, not once the voice loads: iOS only unlocks audio here.
    const sound = createWorkoutSound();
    onStart(prefs.mode, (startedAt) => ({
      initial: startWorkout(buildWorkoutSteps(goal), startedAt, {
        reps,
        tempoMs,
      }),
      mode: prefs.mode,
      sound,
      music: prefs.music,
    }));
  }

  useEffect(() => {
    if (prefs.music) void preloadWorkoutMusic().catch(() => {});
  }, [prefs.music]);

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
      <Button
        type="button"
        variant={prefs.music ? 'default' : 'outline'}
        className="w-full"
        aria-pressed={prefs.music}
        onClick={() => setPrefs({...prefs, music: !prefs.music})}
      >
        <Music />
        Music {prefs.music ? 'on' : 'off'}
      </Button>
      <TempoStepper
        tempoMs={tempoMs}
        onChange={(value) => setTempoMs(clampTempo(value))}
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
  useWorkoutMusic(musicOn, running && !firstCountdown, step.kind === 'rest');

  function toggleMusic() {
    unlockAudio();
    setMusicOn(!musicOn);
    savePrefs({...loadPrefs(), music: !musicOn});
  }

  const playCue = useCallback(
    (current: WorkoutState, time: number) => {
      const cue = currentCue(current, time);
      if (!cue || cue.key === lastCueKey.current) return;
      lastCueKey.current = cue.key;
      if (cue.lateMs <= MAX_CUE_LATE_MS) {
        sound?.play(cue.cue, mode, current.tempoMs, leadInBeats(current));
      }
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
      if (endCue) sound?.play(endCue, mode, next.tempoMs, leadInBeats(next));
      stateRef.current = next;
      setState(next);
      setNow(time);
    },
    [playCue, sound, mode],
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
    onComplete(
      goal.type === 'STRENGTH'
        ? {sets: Math.max(1, state.setsCompleted), reps: state.reps}
        : undefined,
    );
  }, [state.done, state.setsCompleted, state.reps, goal.type, onComplete]);

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
        <div className="grid w-full grid-cols-2 gap-3">
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

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={musicOn}
          className={musicOn ? undefined : 'text-muted-foreground'}
          onClick={toggleMusic}
        >
          <Music />
          Music {musicOn ? 'on' : 'off'}
        </Button>
        <Button variant="ghost" size="sm" onClick={cancel}>
          <X />
          Cancel without logging
        </Button>
      </div>
    </div>
  );
}
