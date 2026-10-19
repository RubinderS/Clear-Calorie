'use client';

import {formatDistanceToNowStrict} from 'date-fns';
import {SquarePen, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {ChatThreadSummary} from '@/lib/chat/view';
import {cn} from '@/lib/utils';

/** Past conversations with new chat and delete. */
export function ThreadList({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: ChatThreadSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="p-3">
        <Button type="button" variant="outline" className="h-11 w-full" onClick={onNew}>
          <SquarePen aria-hidden /> New chat
        </Button>
      </div>
      {threads.length === 0 ? (
        <p className="px-4 py-2 text-sm text-muted-foreground">No chats yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3" aria-label="Chats">
          {threads.map((thread) => (
            <li key={thread.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                aria-current={thread.id === activeId ? 'true' : undefined}
                className={cn(
                  'block min-h-11 w-full rounded-xl py-2 pl-3 pr-11 text-left transition-colors',
                  thread.id === activeId
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60',
                )}
              >
                <span className="block truncate text-sm font-medium">{thread.title}</span>
                {/* Relative time can tick over between server render and hydration. */}
                <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                  {formatDistanceToNowStrict(new Date(thread.updatedAt), {addSuffix: true})}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete chat: ${thread.title}`}
                onClick={() => {
                  if (window.confirm('Delete this chat?')) onDelete(thread.id);
                }}
                className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
