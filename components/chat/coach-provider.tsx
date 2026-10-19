'use client';

import * as React from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ArrowLeft, Maximize2, Sparkles, SquarePen, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Select} from '@/components/ui/select';
import {ChatPanel} from './chat-panel';
import {useChat, useThreads, type ChatState} from './use-chat';

const OPEN_KEY = 'clearcalorie-coach-open';
const THREAD_KEY = 'clearcalorie-coach-thread';
const MOBILE_QUERY = '(max-width: 767px)';
/** Search param marking the history entry pushed when the sheet opens on mobile. */
const COACH_PARAM = 'coach';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked, e.g. in a private window; the coach still works.
  }
}

function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(MOBILE_QUERY);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

/**
 * The visible viewport while the sheet is open, so the on-screen keyboard
 * never hides the message box (iOS overlays the keyboard instead of
 * resizing the page).
 */
function useVisualViewport(active: boolean) {
  const [viewport, setViewport] = React.useState<{height: number; top: number} | null>(null);
  React.useEffect(() => {
    const visual = window.visualViewport;
    if (!active || !visual) return;
    const update = () => setViewport({height: visual.height, top: visual.offsetTop});
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    return () => {
      visual.removeEventListener('resize', update);
      visual.removeEventListener('scroll', update);
      setViewport(null);
    };
  }, [active]);
  return viewport;
}

const hasCoachParam = () =>
  new URLSearchParams(window.location.search).get(COACH_PARAM) === '1';

/** Reopens the desktop drawer, or the sheet after a reload with ?coach=1. */
function initialOpen() {
  if (typeof window === 'undefined') return false;
  return (
    hasCoachParam() ||
    (!window.matchMedia(MOBILE_QUERY).matches && readStorage(OPEN_KEY) === '1')
  );
}

const subscribeNothing = () => () => {};

type CoachContextValue = {openCoach: () => void; hidden: boolean};

const CoachContext = React.createContext<CoachContextValue | null>(null);

/**
 * The coach's conversation, which the /chat page shows too, so a reply
 * streaming in the drawer carries on when it is expanded to the full page.
 */
const CoachChatContext = React.createContext<ChatState | null>(null);

export function useCoachChat() {
  const chat = React.useContext(CoachChatContext);
  if (!chat) throw new Error('useCoachChat must be used inside CoachProvider');
  return chat;
}

/**
 * The AI coach, available on every dashboard page: a right-side drawer on
 * desktop (opened from a floating button) and a full-screen sheet on mobile
 * (opened from the header). Hidden on /chat, which shows the full page.
 */
export function CoachProvider({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hidden = pathname === '/chat' || pathname.startsWith('/chat/');
  const mobile = useIsMobile();
  // Nothing renders until after hydration, so restoring open state can't mismatch.
  const mounted = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [open, setOpen] = React.useState(initialOpen);
  // Whether opening pushed a history entry that closing should pop.
  const pushedRef = React.useRef(false);
  const restoredRef = React.useRef(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const {threads, refresh} = useThreads();
  const chat = useChat({onThreadsChanged: refresh});
  const {loadThread, threadId} = chat;
  const hasConversation = threadId !== null || chat.items.length > 0;

  const openCoach = React.useCallback(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    if (window.matchMedia(MOBILE_QUERY).matches && !hasCoachParam()) {
      const url = new URL(window.location.href);
      url.searchParams.set(COACH_PARAM, '1');
      window.history.pushState(null, '', url);
      pushedRef.current = true;
    }
    setOpen(true);
  }, []);

  const closeCoach = React.useCallback(() => {
    setOpen(false);
    // Only pop the entry the sheet pushed, not a page navigated to since.
    if (pushedRef.current && hasCoachParam()) {
      pushedRef.current = false;
      window.history.back();
    }
    triggerRef.current?.focus({preventScroll: true});
  }, []);

  // A reload kept ?coach=1; drop it so closing doesn't need to go back.
  React.useEffect(() => {
    if (!hasCoachParam()) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(COACH_PARAM);
    window.history.replaceState(null, '', url);
  }, []);

  // Back button or swipe closes the sheet; forward reopens it.
  React.useEffect(() => {
    const handlePopState = () => {
      if (hasCoachParam()) {
        pushedRef.current = true;
        setOpen(true);
      } else {
        pushedRef.current = false;
        setOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // The sheet covers the page on mobile, so close it when navigating; the
  // desktop drawer stays open beside the new page.
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (mobile && open) setOpen(false);
  }

  React.useEffect(() => {
    if (mounted && !mobile) writeStorage(OPEN_KEY, open ? '1' : null);
  }, [mobile, mounted, open]);

  // Load the last conversation the first time the coach opens, unless one
  // was already started on the /chat page.
  React.useEffect(() => {
    if (!open || restoredRef.current) return;
    restoredRef.current = true;
    void refresh();
    const saved = readStorage(THREAD_KEY);
    if (saved && !hasConversation) void loadThread(saved);
  }, [hasConversation, loadThread, open, refresh]);

  React.useEffect(() => {
    if (restoredRef.current) writeStorage(THREAD_KEY, threadId);
  }, [threadId]);

  const sheetOpen = open && mobile && !hidden;
  const viewport = useVisualViewport(sheetOpen);

  React.useEffect(() => {
    if (!sheetOpen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [sheetOpen]);

  const value = React.useMemo(() => ({openCoach, hidden}), [hidden, openCoach]);
  const showCurrent = threadId !== null && !threads.some((thread) => thread.id === threadId);

  return (
    <CoachContext.Provider value={value}>
      <CoachChatContext.Provider value={chat}>
        {/* The page is inert behind the full-screen sheet, which traps focus. */}
        <div className={className} inert={sheetOpen}>
          {children}
        </div>

        {mounted && !hidden && !open && (
          <Button
            type="button"
            onClick={openCoach}
            className="fixed bottom-6 right-6 z-40 hidden h-12 rounded-full px-5 shadow-xl md:inline-flex"
          >
            <Sparkles aria-hidden /> Ask coach
          </Button>
        )}

        {mounted &&
          open &&
          !hidden &&
          createPortal(
            <div
              role="dialog"
              aria-modal={mobile}
              aria-label="Coach"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  closeCoach();
                }
              }}
              style={mobile && viewport ? {height: viewport.height, top: viewport.top} : undefined}
              className="fixed inset-x-0 top-0 z-[60] flex h-dvh flex-col bg-background md:bottom-0 md:left-auto md:h-auto md:w-[420px] md:border-l md:border-border/60 md:shadow-2xl"
            >
              {/* On phones the chat picker gets a second row under the buttons;
                  inline it would be squeezed unreadably narrow. */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1 border-b border-border/50 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label="Close coach"
                  onClick={closeCoach}
                >
                  {mobile ? <ArrowLeft aria-hidden /> : <X aria-hidden />}
                </Button>
                <h2 className="mr-1 font-semibold">Coach</h2>
                <Select
                  aria-label="Chat"
                  value={threadId ?? ''}
                  onChange={(event) => {
                    if (event.target.value) void loadThread(event.target.value);
                    else chat.newChat();
                  }}
                  wrapperClassName="col-span-full row-start-2 min-w-0 px-1 md:col-span-1 md:col-start-3 md:row-start-1 md:px-0"
                  className="h-10"
                >
                  <option value="">New chat</option>
                  {showCurrent && <option value={threadId}>Current chat</option>}
                  {threads.map((thread) => (
                    <option key={thread.id} value={thread.id}>
                      {thread.title}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label="New chat"
                  onClick={chat.newChat}
                >
                  <SquarePen aria-hidden />
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                >
                  <Link
                    href={threadId ? `/chat?thread=${threadId}` : '/chat'}
                    aria-label="Open full page"
                  >
                    <Maximize2 aria-hidden />
                  </Link>
                </Button>
              </div>
              <ChatPanel chat={chat} autoFocus={!mobile} className="flex-1" />
            </div>,
            document.body,
          )}
      </CoachChatContext.Provider>
    </CoachContext.Provider>
  );
}

/** Opens the coach sheet from the header on mobile. */
export function CoachHeaderButton() {
  const context = React.useContext(CoachContext);
  if (!context || context.hidden) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Open coach"
      onClick={context.openCoach}
      className="md:hidden"
    >
      <Sparkles aria-hidden className="size-5" />
    </Button>
  );
}
