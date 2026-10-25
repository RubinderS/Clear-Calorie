import {db} from '@/lib/db';
import type {Doc} from '@/lib/models';
import {toPlain, toPlainAll} from './plain';
import type {ChatAction, ChatMessage, ChatThread} from './types';

export type ThreadWithItems = ChatThread & {
  /** User and assistant messages with content, oldest first. */
  messages: ChatMessage[];
  /** Proposed entries, oldest first. */
  actions: ChatAction[];
};

// Messages replay in write order. createdAt alone ties when two are saved in
// the same millisecond (e.g. an assistant turn and its tool results).
let lastSeq = 0;
function nextSeq() {
  lastSeq = Math.max(Date.now() * 1000, lastSeq + 1);
  return lastSeq;
}
const MESSAGE_ORDER = {createdAt: 1, seq: 1} as const;

async function toMessages(docs: (Doc<ChatMessage> & {seq: number})[]) {
  const {ChatMessage} = await db();
  return toPlainAll(ChatMessage, docs).map((message): ChatMessage => {
    const {id, threadId, role, content, toolCalls, toolCallId, createdAt} = message;
    return {id, threadId, role, content, toolCalls, toolCallId, createdAt};
  });
}

/** The user's most recently updated threads. */
export async function listChatThreads(userId: string, take: number): Promise<ChatThread[]> {
  const {ChatThread} = await db();
  const docs = await ChatThread.find({userId}).sort({updatedAt: -1}).limit(take).lean();
  return toPlainAll(ChatThread, docs);
}

export async function findChatThread(userId: string, id: string): Promise<ChatThread | null> {
  const {ChatThread} = await db();
  const doc = await ChatThread.findOne({_id: id, userId}).lean();
  return doc && toPlain(ChatThread, doc);
}

export async function findChatThreadWithItems(
  userId: string,
  id: string,
): Promise<ThreadWithItems | null> {
  const {ChatMessage, ChatAction} = await db();
  const thread = await findChatThread(userId, id);
  if (!thread) return null;
  const [messages, actions] = await Promise.all([
    ChatMessage.find({
      threadId: id,
      role: {$in: ['user', 'assistant']},
      content: {$ne: null},
    })
      .sort(MESSAGE_ORDER)
      .lean(),
    ChatAction.find({threadId: id}).sort({createdAt: 1}).lean(),
  ]);
  return {
    ...thread,
    messages: await toMessages(messages),
    actions: toPlainAll(ChatAction, actions),
  };
}

export async function createChatThread(userId: string, title: string): Promise<ChatThread> {
  const {ChatThread} = await db();
  const doc = await ChatThread.create({userId, title});
  return toPlain(ChatThread, doc.toObject());
}

/** Deletes a thread with its messages and actions; false when it isn't the user's. */
export async function deleteChatThread(userId: string, id: string) {
  const {ChatThread, ChatMessage, ChatAction} = await db();
  const result = await ChatThread.deleteOne({_id: id, userId});
  if (result.deletedCount === 0) return false;
  await Promise.all([
    ChatMessage.deleteMany({threadId: id}),
    ChatAction.deleteMany({threadId: id}),
  ]);
  return true;
}

/** Moves a thread to the top of the list. */
export async function touchChatThread(id: string) {
  const {ChatThread} = await db();
  await ChatThread.updateOne({_id: id}, {$set: {updatedAt: new Date()}});
}

/** Every message in a thread, oldest first. */
export async function listChatMessages(threadId: string): Promise<ChatMessage[]> {
  const {ChatMessage} = await db();
  return toMessages(await ChatMessage.find({threadId}).sort(MESSAGE_ORDER).lean());
}

export async function createChatMessage(
  data: Pick<ChatMessage, 'threadId' | 'role'> &
    Partial<Pick<ChatMessage, 'content' | 'toolCalls' | 'toolCallId'>>,
) {
  const {ChatMessage} = await db();
  await ChatMessage.create({...data, seq: nextSeq()});
}

export async function createChatAction(
  data: Pick<ChatAction, 'threadId' | 'userId' | 'kind' | 'payload'>,
): Promise<ChatAction> {
  const {ChatAction} = await db();
  const doc = await ChatAction.create(data);
  return toPlain(ChatAction, doc.toObject());
}

export async function findChatAction(userId: string, id: string): Promise<ChatAction | null> {
  const {ChatAction} = await db();
  const doc = await ChatAction.findOne({_id: id, userId}).lean();
  return doc && toPlain(ChatAction, doc);
}

/**
 * Moves a pending action to `status`; false when it isn't pending (anymore),
 * so only one request can confirm it.
 */
export async function resolveChatAction(
  userId: string,
  id: string,
  status: 'confirmed' | 'dismissed',
) {
  const {ChatAction} = await db();
  const result = await ChatAction.updateOne(
    {_id: id, userId, status: 'pending'},
    {$set: {status, resolvedAt: new Date()}},
  );
  return result.modifiedCount > 0;
}

/** Puts a resolved action back to pending. */
export async function reopenChatAction(id: string) {
  const {ChatAction} = await db();
  await ChatAction.updateOne({_id: id}, {$set: {status: 'pending', resolvedAt: null}});
}

/** Links a confirmed action to the entry or goal it created or changed. */
export async function setChatActionResult(id: string, resultId: string) {
  const {ChatAction} = await db();
  await ChatAction.updateOne({_id: id}, {$set: {resultId}});
}
