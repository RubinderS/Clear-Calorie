'use client';

import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type LazyExoticComponent,
  type RefObject,
} from 'react';
import {ChevronRight, CircleHelp} from 'lucide-react';
import {EXERCISE_ANIMATIONS} from '@/components/exercise-animations';
import {Button} from '@/components/ui/button';
import {Dialog} from '@/components/ui/dialog';
import {
  frameAt,
  scalePhases,
  type ExerciseScene,
} from '@/lib/exercise-animation';
import {
  bodyAreaLabel,
  exerciseCatalog,
  type CatalogEntry,
} from '@/lib/exercise-catalog';
import type {AnimationSync} from '@/lib/workout';
import {cn} from '@/lib/utils';

// Made once per exercise so React keeps the loaded scene between renders.
const scenes = new Map<string, LazyExoticComponent<ExerciseScene>>();

function sceneFor(id: string) {
  const load = EXERCISE_ANIMATIONS[id];
  if (!load) return null;
  let scene = scenes.get(id);
  if (!scene) {
    scene = lazy(load);
    scenes.set(id, scene);
  }
  return scene;
}

/** False while the element is scrolled away or the tab is hidden. */
function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let inView = true;
    const update = () => setOnScreen(inView && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref]);
  return onScreen;
}

// One slow frame shouldn't skip a whole phase.
const MAX_FRAME_MS = 50;

/**
 * Plays a built-in exercise's animation. Without `sync` it loops at the
 * exercise's own tempo; with it the workout drives it, each rep lasting one
 * tempo beat.
 */
export function ExerciseAnimation({
  entry,
  sync,
  className,
  maxHeightClassName = '[&>*]:max-h-[min(55vh,26rem)]',
}: {
  entry: CatalogEntry;
  sync?: {key: string; message: AnimationSync} | null;
  className?: string;
  /** Caps the scene's height, so a tall one (standing, arms up) fits its place. */
  maxHeightClassName?: string;
}) {
  const Scene = sceneFor(entry.id);
  const container = useRef<HTMLElement>(null);
  const onScreen = useOnScreen(container);
  const [time, setTime] = useState(0);
  const clock = useRef(0);

  const message = sync?.message;
  const repMs = message?.cmd === 'sync' ? message.repMs : null;
  const phases = useMemo(
    () => (repMs ? scalePhases(entry.phases, repMs) : entry.phases),
    [entry.phases, repMs],
  );
  const playing = message ? message.cmd !== 'pose' && message.playing : true;

  // Jumps to where the workout is once per key; between keys the clock runs
  // on its own, so it isn't reset every render.
  const latest = useRef(message);
  useEffect(() => {
    latest.current = message;
  });
  const key = sync?.key;
  useEffect(() => {
    const current = latest.current;
    if (!key || !current) return;
    if (current.cmd === 'sync') clock.current = current.repElapsedMs;
    if (current.cmd === 'pose') clock.current = 0;
    const id = requestAnimationFrame(() => setTime(clock.current));
    return () => cancelAnimationFrame(id);
  }, [key]);

  const running = playing && onScreen;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      clock.current += Math.min(MAX_FRAME_MS, Math.max(0, now - last));
      last = now;
      setTime(clock.current);
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [running]);

  if (!Scene) return null;
  const frame = frameAt(phases, time);
  return (
    <figure ref={container} className={cn('space-y-2', className)}>
      {/* Each scene's viewBox sets its height; reserve about one until it loads. */}
      <div className={cn('w-full [&>*]:mx-auto [&>*]:block', maxHeightClassName)}>
        <Suspense fallback={<div className="aspect-680/400 w-full" />}>
          <Scene frame={frame} />
        </Suspense>
      </div>
    </figure>
  );
}

export function ExerciseAreas({
  entry,
  className,
}: {
  entry: CatalogEntry;
  className?: string;
}) {
  // Plain text, not chips, so nothing looks tappable.
  const {primary, secondary} = entry.areas;
  return (
    <p role="group" aria-label="Areas worked" className={cn('text-sm', className)}>
      <span className="text-muted-foreground">Works </span>
      <span className="font-semibold">{primary.map(bodyAreaLabel).join(', ')}</span>
      {secondary.length > 0 && (
        <span className="text-muted-foreground"> · also {secondary.map(bodyAreaLabel).join(', ')}</span>
      )}
    </p>
  );
}

/**
 * The main body area a built-in exercise works, as a small label beside its
 * name; nothing for the user's own exercises.
 */
export function ExerciseAreaTag({
  catalogId,
  className,
}: {
  catalogId: string | null | undefined;
  className?: string;
}) {
  const entry = exerciseCatalog.get(catalogId);
  if (!entry) return null;
  return (
    <span
      title="Main area worked"
      className={cn('shrink-0 text-xs text-muted-foreground', className)}
    >
      {entry.areas.primary.map(bodyAreaLabel).join(', ')}
    </span>
  );
}

function TipList({
  title,
  items,
  numbered,
  collapsible,
}: {
  title: string;
  items: string[];
  numbered?: boolean;
  /** Starts collapsed, opened by tapping its title. */
  collapsible?: boolean;
}) {
  if (items.length === 0) return null;
  const List = numbered ? 'ol' : 'ul';
  const list = (
    <List
      aria-label={title}
      className={cn(
        'mt-1 space-y-0.5 pl-5 text-sm text-muted-foreground',
        numbered ? 'list-decimal' : 'list-disc',
      )}
    >
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </List>
  );
  if (collapsible) {
    return (
      <details className="group">
        <summary className="-mx-1 flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-1 text-sm font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
          {title}
        </summary>
        {list}
      </details>
    );
  }
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {list}
    </div>
  );
}

/**
 * A "How to" button opening the animation, areas, steps and tips, for an
 * exercise linked to the built-in list; nothing for the user's own ones.
 */
export function ExerciseHowTo({
  catalogId,
  className,
  compact = false,
}: {
  catalogId: string | null | undefined;
  className?: string;
  /** Icon only on phones, for rows that are short on width. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const entry = exerciseCatalog.get(catalogId);
  if (!entry) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        aria-label={`How to do ${entry.name}`}
        onClick={() => setOpen(true)}
      >
        <CircleHelp />
        <span className={compact ? 'max-sm:hidden' : undefined}>How to</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={`How to do ${entry.name}`}>
        <div className="space-y-4 p-5">
          <h2 className="pr-8 text-lg font-semibold">{entry.name}</h2>
          <ExerciseAnimation entry={entry} />
          <ExerciseAreas entry={entry} />
          {/* One step per phase of the rep, in the order the animation plays them */}
          <TipList title="Steps" items={entry.phases.map((phase) => phase.cue)} numbered />
          <div>
            <TipList title="Form tips" items={entry.formTips} collapsible />
            <TipList title="Common mistakes" items={entry.commonMistakes} collapsible />
          </div>
        </div>
      </Dialog>
    </>
  );
}
