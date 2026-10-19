'use client';

import * as React from 'react';
import {ArrowLeft, MessagesSquare} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {ChatThreadSummary} from '@/lib/chat/view';
import {cn} from '@/lib/utils';
import {ChatPanel} from './chat-panel';
import {ThreadList} from './thread-list';
import {useCoachChat} from './coach-provider';
import {useThreads} from './use-chat';

/** Keeps ?thread= in the URL in step with the open chat, without navigating. */
function syncThreadParam(threadId: string | null) {
  const url = new URL(window.location.href);
  if (threadId) url.searchParams.set('thread', threadId);
  else url.searchParams.delete('thread');
  if (url.href !== window.location.href) window.history.replaceState(null, '', url);
}

/**
 * The full chat page: past chats beside the conversation on desktop; on
 * mobile, the list and the conversation are separate screens.
 */
export function ChatPageClient({
  initialThreads,
  initialThreadId,
}: {
  initialThreads: ChatThreadSummary[];
  initialThreadId: string | null;
}) {
  const {threads, refresh, remove} = useThreads(initialThreads);
  // The coach drawer's conversation, so a reply it was streaming keeps going.
  const chat = useCoachChat();
  const {loadThread, newChat, threadId, streaming} = chat;
  const [mobileView, setMobileView] = React.useState<'list' | 'chat'>(
    initialThreadId || initialThreads.length === 0 ? 'chat' : 'list',
  );

  // Skip reloading the chat the drawer already shows: the saved copy lacks
  // a reply still streaming.
  const shownThreadRef = React.useRef(threadId);
  React.useEffect(() => {
    shownThreadRef.current = threadId;
  }, [threadId]);
  React.useEffect(() => {
    if (initialThreadId && initialThreadId !== shownThreadRef.current) {
      void loadThread(initialThreadId);
    }
  }, [initialThreadId, loadThread]);

  // The drawer's chat refreshes its own list, so refresh this one when a
  // reply finishes.
  const [wasStreaming, setWasStreaming] = React.useState(streaming);
  if (streaming !== wasStreaming) {
    setWasStreaming(streaming);
    if (!streaming) void refresh();
  }

  React.useEffect(() => {
    syncThreadParam(threadId);
  }, [threadId]);

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[26rem] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm md:h-[calc(100dvh-13rem)]">
      <aside
        className={cn(
          'w-full flex-col border-border/50 md:flex md:w-72 md:shrink-0 md:border-r',
          mobileView === 'list' ? 'flex' : 'hidden',
        )}
      >
        <ThreadList
          threads={threads}
          activeId={threadId}
          onSelect={(id) => {
            void loadThread(id);
            setMobileView('chat');
          }}
          onNew={() => {
            newChat();
            setMobileView('chat');
          }}
          onDelete={async (id) => {
            if ((await remove(id)) && id === threadId) newChat();
          }}
        />
      </aside>
      <section
        className={cn(
          'min-w-0 flex-1 flex-col md:flex',
          mobileView === 'chat' ? 'flex' : 'hidden',
        )}
        aria-label="Conversation"
      >
        <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="All chats"
            onClick={() => {
              setMobileView('list');
              void refresh();
            }}
          >
            <ArrowLeft aria-hidden />
          </Button>
          <span className="truncate text-sm font-medium">
            {threads.find((thread) => thread.id === threadId)?.title ?? 'New chat'}
          </span>
          <MessagesSquare aria-hidden className="ml-auto mr-3 size-4 shrink-0 text-muted-foreground" />
        </div>
        <ChatPanel chat={chat} autoFocus className="flex-1" />
      </section>
    </div>
  );
}
