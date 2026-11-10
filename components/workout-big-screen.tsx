'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import {Maximize2, Minimize2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';

/*
 * The big screen is the same workout screen, filling the window and scaled
 * up so it can be followed from across the room. It's the same elements, not
 * a copy, so every control is there and nothing restarts when it's toggled.
 */

// Tailwind's md breakpoint, where the big screen is offered.
const DESKTOP_QUERY = '(min-width: 48rem)';
const PREF_KEY = 'clearcalorie:workout-big-screen';
/** How much bigger everything is on the big screen, at most. */
export const BIG_SCREEN_ZOOM = 1.35;
/**
 * The window height, in CSS pixels before zoom, the big screen's layout is
 * made to fit. Shorter windows zoom less (never below 1), so everything
 * still fits without scrolling.
 */
const BIG_SCREEN_FIT_HEIGHT = 800;

/** The zoom that fits the big screen's layout in a window this tall. */
export function bigScreenZoomFor(windowHeight: number): number {
  const zoom = Math.floor((windowHeight / BIG_SCREEN_FIT_HEIGHT) * 100) / 100;
  return Math.min(BIG_SCREEN_ZOOM, Math.max(1, zoom));
}

function subscribeResize(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the screen is desktop-wide; false on the server. */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** Whether workouts start on the big screen: on until turned off. */
export function loadBigScreenPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveBigScreenPref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {}
}

export type BigScreenState = {big: boolean; setBig: (big: boolean) => void};

/** A window's state, plus a screen inside it that Escape goes back from. */
type KeyTarget = BigScreenState & {back?: () => void};

// For a component outside any big screen, so its hooks still run.
const NO_BIG_SCREEN: BigScreenState = {big: false, setBig() {}};

const BigScreenContext = createContext<BigScreenState | null>(null);
export const BigScreenProvider = BigScreenContext.Provider;

/** The big screen around this one, if there is one to toggle. */
export function useBigScreenState(): BigScreenState | null {
  return useContext(BigScreenContext);
}

/** Whether the screen around this one is on the big screen. */
export function useBigScreen(): boolean {
  return useContext(BigScreenContext)?.big ?? false;
}

// Windows and screens listening for the keys, innermost (last opened) last:
// only it acts, so F11 in a How to opened over the exercise panel toggles the
// How to, and Escape in a workout goes back to the plan.
const listening: {current: KeyTarget}[] = [];

function onBigScreenKey(event: KeyboardEvent) {
  const current = listening.at(-1)?.current;
  if (!current) return;
  if (event.key === 'F11' && !event.repeat) {
    event.preventDefault();
    current.setBig(!current.big);
  } else if (event.key === 'Escape' && current.big) {
    // Caught first, so the dialog it's in doesn't also close.
    event.preventDefault();
    event.stopPropagation();
    // A held key shouldn't go back and then leave the big screen too.
    if (event.repeat) return;
    if (current.back) current.back();
    else current.setBig(false);
  }
}

/**
 * While enabled (a workout window is showing) on desktop, F11 toggles the big
 * screen in place of the browser's own full screen. On it, Escape leaves it
 * rather than closing the window it's in.
 */
export function useBigScreenKeys(enabled: boolean, state: KeyTarget) {
  const desktop = useIsDesktop();
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    if (!enabled || !desktop) return;
    if (listening.length === 0) {
      window.addEventListener('keydown', onBigScreenKey, {capture: true});
    }
    listening.push(latest);
    return () => {
      listening.splice(listening.indexOf(latest), 1);
      if (listening.length === 0) {
        window.removeEventListener('keydown', onBigScreenKey, {capture: true});
      }
    };
  }, [enabled, desktop]);
}

/**
 * While active, a screen opened inside a big screen (a workout, a log
 * review): Escape there runs `back` rather than leaving the big screen, so a
 * second Escape is what leaves it.
 */
export function useBigScreenBack(active: boolean, back: () => void) {
  const state = useContext(BigScreenContext);
  useBigScreenKeys(active && state !== null, {
    ...(state ?? NO_BIG_SCREEN),
    back,
  });
}

/** Classes that make a card or dialog fill the window on the big screen. */
export const BIG_SCREEN_FRAME =
  'fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto rounded-none border-0 bg-background shadow-none hover:shadow-none';

/**
 * Scales the big screen's content as far as the window's height allows;
 * `--big-zoom` lets sizes in vh undo it, so `100dvh / var(--big-zoom)` is
 * the height there is to fill.
 */
export function useBigScreenZoom(big: boolean): CSSProperties | undefined {
  const zoom = useSyncExternalStore(
    subscribeResize,
    () => bigScreenZoomFor(window.innerHeight),
    () => BIG_SCREEN_ZOOM,
  );
  return big ? ({zoom, '--big-zoom': zoom} as CSSProperties) : undefined;
}

/** Turns the big screen on or off; desktop only. */
export function BigScreenToggle({className}: {className?: string}) {
  const state = useContext(BigScreenContext);
  if (!state) return null;
  const {big, setBig} = state;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('max-md:hidden', className)}
      onClick={() => setBig(!big)}
    >
      {big ? <Minimize2 /> : <Maximize2 />}
      {big ? 'Exit big screen' : 'Big screen'}
    </Button>
  );
}
