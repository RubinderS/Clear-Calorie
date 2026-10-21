import type {ChatAction} from '@prisma/client';
import {prisma} from '@/lib/prisma';

export type ChatActionKind = 'food' | 'exercise' | 'weight' | 'plan' | 'links';
export type ChatActionStatus = 'pending' | 'confirmed' | 'dismissed';

/** A proposed log entry or plan change as the chat UI shows it. */
export type ChatActionView = {
  id: string;
  kind: ChatActionKind;
  status: ChatActionStatus;
  /** The entry as the log API takes it, or the PlanChange for a plan. */
  entry: Record<string, unknown>;
  /** The AI's assumptions, e.g. portion sizes. */
  note?: string;
  createdAt: string;
};

export function parseActionPayload(payload: string): {
  entry: Record<string, unknown>;
  note?: string;
} {
  try {
    const parsed = JSON.parse(payload);
    return {
      entry: parsed?.entry && typeof parsed.entry === 'object' ? parsed.entry : {},
      note: typeof parsed?.note === 'string' ? parsed.note : undefined,
    };
  } catch {
    return {entry: {}};
  }
}

export function toActionView(action: ChatAction): ChatActionView {
  return {
    id: action.id,
    kind: action.kind as ChatActionKind,
    status: action.status as ChatActionStatus,
    ...parseActionPayload(action.payload),
    createdAt: action.createdAt.toISOString(),
  };
}

export type ChatItem =
  | {type: 'message'; id: string; role: 'user' | 'assistant'; content: string; createdAt: string}
  | {type: 'action'; id: string; action: ChatActionView; createdAt: string};

export type ChatThreadSummary = {id: string; title: string; updatedAt: string};

export async function listThreads(userId: string): Promise<ChatThreadSummary[]> {
  const threads = await prisma.chatThread.findMany({
    where: {userId},
    orderBy: {updatedAt: 'desc'},
    select: {id: true, title: true, updatedAt: true},
    take: 50,
  });
  return threads.map((thread) => ({...thread, updatedAt: thread.updatedAt.toISOString()}));
}

/**
 * A thread's visible messages and proposed entries in order; tool calls and
 * results stay hidden. Null when the thread isn't the user's.
 */
export async function loadThreadItems(
  userId: string,
  threadId: string,
): Promise<{thread: ChatThreadSummary; items: ChatItem[]} | null> {
  const thread = await prisma.chatThread.findFirst({
    where: {id: threadId, userId},
    include: {
      messages: {
        where: {role: {in: ['user', 'assistant']}, content: {not: null}},
        orderBy: {createdAt: 'asc'},
      },
      actions: {orderBy: {createdAt: 'asc'}},
    },
  });
  if (!thread) return null;

  const items: ChatItem[] = [
    ...thread.messages
      .filter((message) => message.content?.trim())
      .map((message) => ({
        type: 'message' as const,
        id: message.id,
        role: message.role as 'user' | 'assistant',
        content: message.content!,
        createdAt: message.createdAt.toISOString(),
      })),
    ...thread.actions.map((action) => ({
      type: 'action' as const,
      id: action.id,
      action: toActionView(action),
      createdAt: action.createdAt.toISOString(),
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    thread: {id: thread.id, title: thread.title, updatedAt: thread.updatedAt.toISOString()},
    items,
  };
}
