'use client';

import * as React from 'react';
import type {ChatEvent} from '@/lib/chat/run';
import type {
  ChatActionStatus,
  ChatItem,
  ChatThreadSummary,
} from '@/lib/chat/view';

export type PageContext = {path: string; weekStart?: string};

const GENERIC_ERROR = 'The coach could not answer right now. Please try again.';

let tempId = 0;
const nextTempId = (prefix: string) => `${prefix}-${++tempId}`;

/** Stops the reply being streamed from collecting more text. */
const finishLiveReply = (items: ChatItem[]) =>
  items.map((item) =>
    item.type === 'message' && item.id.startsWith('live-')
      ? {...item, id: nextTempId('done')}
      : item,
  );

/**
 * One chat conversation: loads a thread, sends messages and reads the
 * streamed reply. Shared by the /chat page and the coach drawer.
 */
export function useChat({
  onThreadsChanged,
}: {
  /** Called when a thread is created or gets a new reply. */
  onThreadsChanged?: () => void;
} = {}) {
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ChatItem[]>([]);
  const [status, setStatus] = React.useState<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const readerRef = React.useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  // Set when a reply was cut off, e.g. the phone switched apps; the server
  // finishes it anyway, so the thread is reloaded when the page is back.
  const interruptedRef = React.useRef<string | null>(null);
  const onThreadsChangedRef = React.useRef(onThreadsChanged);
  React.useEffect(() => {
    onThreadsChangedRef.current = onThreadsChanged;
  });

  // Bumped whenever the shown conversation changes, so a reply still being
  // read for the old one is ignored.
  const sessionRef = React.useRef(0);
  // The session a message is being sent in, so a double tap sends it once.
  const sendingRef = React.useRef<number | null>(null);

  const stopReading = React.useCallback(() => {
    sessionRef.current++;
    interruptedRef.current = null;
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
  }, []);

  const loadThread = React.useCallback(
    async (id: string) => {
      stopReading();
      const session = sessionRef.current;
      setThreadId(id);
      setError(null);
      setStatus(null);
      setStreaming(false);
      setLoading(true);
      try {
        const response = await fetch(`/api/chat/threads/${id}`);
        // Another chat was picked while this one loaded.
        if (session !== sessionRef.current) return false;
        if (response.status === 404) {
          setThreadId(null);
          setItems([]);
          return false;
        }
        if (!response.ok) throw new Error();
        const data: {items: ChatItem[]} = await response.json();
        if (session !== sessionRef.current) return false;
        setItems(data.items);
        return true;
      } catch {
        if (session === sessionRef.current) setError('Could not load this chat.');
        return false;
      } finally {
        if (session === sessionRef.current) setLoading(false);
      }
    },
    [stopReading],
  );

  const newChat = React.useCallback(() => {
    stopReading();
    setThreadId(null);
    setItems([]);
    setError(null);
    setStatus(null);
    setStreaming(false);
    setLoading(false);
  }, [stopReading]);

  React.useEffect(() => {
    const handleVisible = () => {
      const id = interruptedRef.current;
      // A reply still being read survived the tab switch; let it finish.
      if (document.visibilityState === 'visible' && id && !readerRef.current) {
        interruptedRef.current = null;
        void loadThread(id);
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [loadThread]);

  const handleEvent = React.useCallback((event: ChatEvent) => {
    switch (event.type) {
      case 'thread':
        setThreadId(event.threadId);
        interruptedRef.current = event.threadId;
        break;
      case 'status':
        // A tool is running; text after it is a new reply, as it is once saved.
        setStatus(event.label);
        setItems(finishLiveReply);
        break;
      case 'text':
        setStatus(null);
        setItems((current) => {
          const last = current.at(-1);
          // Keep appending to the reply being streamed.
          if (last?.type === 'message' && last.role === 'assistant' && last.id.startsWith('live-')) {
            return [...current.slice(0, -1), {...last, content: last.content + event.delta}];
          }
          return [
            ...current,
            {
              type: 'message',
              id: nextTempId('live'),
              role: 'assistant',
              content: event.delta,
              createdAt: new Date().toISOString(),
            },
          ];
        });
        break;
      case 'action':
        setStatus(null);
        setItems((current) => [
          ...finishLiveReply(current),
          {type: 'action', id: event.action.id, action: event.action, createdAt: event.action.createdAt},
        ]);
        break;
      case 'error':
        setError(event.message);
        break;
      case 'done':
        interruptedRef.current = null;
        break;
    }
  }, []);

  const send = React.useCallback(
    async (message: string, context?: PageContext) => {
      const text = message.trim();
      const session = sessionRef.current;
      if (!text || sendingRef.current === session) return;
      sendingRef.current = session;

      setError(null);
      setStatus('Thinking');
      setStreaming(true);
      setItems((current) => [
        ...finishLiveReply(current),
        {
          type: 'message',
          id: nextTempId('user'),
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        },
      ]);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({threadId: threadId ?? undefined, message: text, context}),
        });
        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => null);
          setError(data?.error ?? GENERIC_ERROR);
          return;
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim() || session !== sessionRef.current) continue;
            try {
              handleEvent(JSON.parse(line) as ChatEvent);
            } catch {
              // Ignore a malformed line rather than lose the reply.
            }
          }
        }
      } catch {
        if (session === sessionRef.current && !interruptedRef.current) {
          setError(GENERIC_ERROR);
        }
      } finally {
        if (sendingRef.current === session) sendingRef.current = null;
        if (session === sessionRef.current) {
          readerRef.current = null;
          setStreaming(false);
          setStatus(null);
          setItems(finishLiveReply);
          // The stream ended without "done": the server is still finishing.
          if (interruptedRef.current && document.visibilityState === 'visible') {
            setError(
              'Connection lost. The reply is still being saved; reopen this chat in a moment to see it.',
            );
          }
          onThreadsChangedRef.current?.();
        }
      }
    },
    [handleEvent, threadId],
  );

  const setActionStatus = React.useCallback(
    (id: string, status: ChatActionStatus) => {
      setItems((current) =>
        current.map((item) =>
          item.type === 'action' && item.id === id
            ? {...item, action: {...item.action, status}}
            : item,
        ),
      );
    },
    [],
  );

  return {
    threadId,
    items,
    status,
    streaming,
    loading,
    error,
    send,
    loadThread,
    newChat,
    setActionStatus,
    dismissError: () => setError(null),
  };
}

export type ChatState = ReturnType<typeof useChat>;

/** The user's threads, newest first, refreshed on demand. */
export function useThreads(initial: ChatThreadSummary[] = []) {
  const [threads, setThreads] = React.useState(initial);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch('/api/chat/threads');
      if (response.ok) setThreads(await response.json());
    } catch {
      // Keep the list we have.
    }
  }, []);

  const remove = React.useCallback(async (id: string) => {
    const response = await fetch(`/api/chat/threads/${id}`, {method: 'DELETE'});
    if (response.ok || response.status === 404) {
      setThreads((current) => current.filter((thread) => thread.id !== id));
      return true;
    }
    return false;
  }, []);

  return {threads, refresh, remove};
}

/** What the user is looking at, so "explain this" questions have context. */
export function currentPageContext(): PageContext {
  const {pathname, search} = window.location;
  const week = new URLSearchParams(search).get('week');
  return {path: pathname, ...(pathname === '/reports' && week ? {weekStart: week} : {})};
}
