'use client';

import * as React from 'react';
import {LoaderCircle, SendHorizontal, Sparkles, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import {ActionCard} from './action-card';
import {ChatMarkdown} from './chat-markdown';
import {currentPageContext, type ChatState} from './use-chat';

const SUGGESTIONS = [
  'How was my protein this week?',
  'Am I on track with my weight?',
  'What should I have for dinner to hit my goals?',
  'Log a flat white and a banana',
];

/** Distance from the bottom, in px, that still counts as "at the bottom". */
const STICK_THRESHOLD = 80;

/** Messages, proposed entries and the message box for one conversation. */
export function ChatPanel({
  chat,
  autoFocus = false,
  className,
}: {
  chat: ChatState;
  autoFocus?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const stickRef = React.useRef(true);
  const inputId = React.useId();

  // Follow the reply as it streams, unless the user scrolled up to read.
  React.useEffect(() => {
    const element = scrollRef.current;
    if (element && stickRef.current) element.scrollTop = element.scrollHeight;
  }, [chat.items, chat.status, chat.error]);

  React.useEffect(() => {
    stickRef.current = true;
  }, [chat.threadId]);

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus({preventScroll: true});
  }, [autoFocus]);

  // Grow the box with its text, up to about five lines.
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    // scrollHeight leaves out the border, which border-box height includes.
    const height = input.scrollHeight + input.offsetHeight - input.clientHeight;
    input.style.height = `${Math.min(height, 140)}px`;
    input.style.overflowY = height > 140 ? 'auto' : 'hidden';
  }, [draft]);

  function submit(text: string) {
    if (!text.trim() || chat.streaming) return;
    stickRef.current = true;
    void chat.send(text, currentPageContext());
    setDraft('');
  }

  const empty = chat.items.length === 0 && !chat.loading;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        aria-live="polite"
        aria-busy={chat.streaming}
      >
        {chat.loading && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <LoaderCircle aria-label="Loading chat" className="size-5 animate-spin" />
          </div>
        )}

        {empty && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles aria-hidden className="size-6" />
            </span>
            <div>
              <p className="font-semibold">Ask your coach</p>
              <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                Questions about your food, training and weight, answered from your own logs.
              </p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="min-h-11 rounded-xl border border-input bg-background/60 px-4 py-2 text-left text-sm transition-colors hover:border-primary/30 hover:bg-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {chat.items.map((item) =>
            item.type === 'action' ? (
              <ActionCard
                key={item.id}
                action={item.action}
                onStatusChange={chat.setActionStatus}
              />
            ) : (
              <div
                key={item.id}
                className={cn('flex', item.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  data-testid={`chat-message-${item.role}`}
                  className={cn(
                    'max-w-[85%] wrap-break-word rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                    item.role === 'user'
                      ? 'whitespace-pre-wrap rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md bg-muted',
                  )}
                >
                  {item.role === 'user' ? item.content : <ChatMarkdown text={item.content} />}
                </div>
              </div>
            ),
          )}

          {chat.status && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              {chat.status}…
            </p>
          )}

          {chat.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <span className="flex-1">{chat.error}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={chat.dismissError}
                className="rounded p-0.5 hover:bg-destructive/10"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
        className="border-t border-border/50 bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            Message the coach
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={2000}
            enterKeyHint="send"
            placeholder="Ask anything…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit(draft);
              }
            }}
            // 16px text stops iOS zooming in on focus.
            className="max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background/60 px-4 py-2.5 text-base shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 md:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Send"
            disabled={!draft.trim() || chat.streaming}
          >
            <SendHorizontal aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  );
}
