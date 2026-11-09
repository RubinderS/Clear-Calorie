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
/** How much bigger everything is on the big screen. */
export const BIG_SCREEN_ZOOM = 1.35;

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

// Windows listening for the keys, innermost (last opened) last: only it acts,
// so F11 in a How to opened over the exercise panel toggles the How to.
const listening: {current: BigScreenState}[] = [];

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
    current.setBig(false);
  }
}

/**
 * While enabled (a workout window is showing) on desktop, F11 toggles the big
 * screen in place of the browser's own full screen. On it, Escape leaves it
 * rather than closing the window it's in.
 */
export function useBigScreenKeys(enabled: boolean, state: BigScreenState) {
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

/** Classes that make a card or dialog fill the window on the big screen. */
export const BIG_SCREEN_FRAME =
  'fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto rounded-none border-0 bg-background shadow-none hover:shadow-none';

/** Scales the big screen's content; `--big-zoom` lets sizes in vh undo it. */
export function bigScreenZoom(big: boolean): CSSProperties | undefined {
  return big
    ? ({zoom: BIG_SCREEN_ZOOM, '--big-zoom': BIG_SCREEN_ZOOM} as CSSProperties)
    : undefined;
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
