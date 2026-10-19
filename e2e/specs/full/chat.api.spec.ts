import type {APIRequestContext} from '@playwright/test';
import {test, expect} from '../../fixtures/test';
import {seedFood} from '../../fixtures/db';
import {FOOD_ESTIMATE} from '../../mocks/data';

type ChatEvent = {type: string; [key: string]: unknown};

/** Sends a chat message and reads the whole NDJSON stream. */
async function chat(
  api: APIRequestContext,
  message: string,
  extra: Record<string, unknown> = {},
) {
  const response = await api.post('/api/chat', {data: {message, ...extra}});
  const events: ChatEvent[] = response.ok()
    ? (await response.text())
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const thread = events.find((event) => event.type === 'thread');
  return {
    response,
    events,
    threadId: thread?.threadId as string | undefined,
    text: events
      .filter((event) => event.type === 'text')
      .map((event) => event.delta)
      .join(''),
  };
}

test('CHAT-01 needs a signed-in user', async ({request}) => {
  expect((await request.post('/api/chat', {data: {message: 'hi'}})).status()).toBe(401);
  expect((await request.get('/api/chat/threads')).status()).toBe(401);
  expect(
    (await request.post('/api/chat/actions/x', {data: {decision: 'confirm'}})).status(),
  ).toBe(401);
});

test('CHAT-02 rejects invalid messages', async ({api}) => {
  for (const data of [{}, {message: '   '}, {message: 'x'.repeat(2001)}]) {
    expect((await api.post('/api/chat', {data})).status()).toBe(400);
  }
});

test('CHAT-03 answers from the user own data via a tool call', async ({
  api,
  db,
  user,
  makeUser,
  mock,
}) => {
  await seedFood(db, user.id, {name: 'Chicken', protein: 42});
  // Another user's food must never reach the tool result.
  const other = await makeUser();
  await seedFood(db, other.id, {name: 'Other', protein: 999});

  const message = `[ai:chat-tool] How was my protein? ${user.id}`;
  const {response, events, threadId, text} = await chat(api, message);
  expect(response.headers()['content-type']).toContain('application/x-ndjson');
  expect(events.map((event) => event.type)).toEqual([
    'thread',
    'status',
    ...events.filter((event) => event.type === 'text').map(() => 'text'),
    'done',
  ]);
  expect(events[1]).toEqual({type: 'status', label: 'Adding up your daily totals'});
  expect(text).toBe('You logged food on 1 days, averaging **42 g** protein.');

  const messages = await db.chatMessage.findMany({
    where: {threadId},
    orderBy: {createdAt: 'asc'},
  });
  expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  expect(JSON.parse(messages[1].toolCalls!)[0].function).toEqual({
    name: 'get_daily_totals',
    arguments: '{}',
  });
  expect(messages[2].content).not.toContain('999');

  const thread = await db.chatThread.findUniqueOrThrow({where: {id: threadId}});
  expect(thread).toMatchObject({userId: user.id, title: message});

  // The model was offered the tools, and the second call carried the result.
  const calls = await mock.requests(user.id);
  expect(calls).toHaveLength(2);
  expect(calls[0].body.stream).toBe(true);
  expect(calls[0].body.tools?.map((tool) => tool.function.name)).toContain(
    'propose_food_log',
  );
  expect(calls[1].body.messages.at(-1)?.role).toBe('tool');

  const threads = await (await api.get('/api/chat/threads')).json();
  expect(threads).toEqual([
    {id: threadId, title: thread.title, updatedAt: expect.any(String)},
  ]);
  const view = await (await api.get(`/api/chat/threads/${threadId}`)).json();
  // Tool calls and results stay hidden.
  expect(view.items.map((item: {role: string}) => item.role)).toEqual([
    'user',
    'assistant',
  ]);
});

test('CHAT-04 continues an existing thread with its history', async ({api, mock, user}) => {
  const first = await chat(api, `Hello ${user.id}`);
  expect(first.text).toBe('Hello from the mock coach.');

  const second = await chat(api, `Again ${user.id}`, {threadId: first.threadId});
  expect(second.threadId).toBe(first.threadId);
  const [call] = await mock.requests(`Again ${user.id}`);
  expect(call.body.messages.map((m) => m.role)).toEqual([
    'system',
    'user',
    'assistant',
    'user',
  ]);
});

test('CHAT-05 a proposed entry is logged only once, on confirm', async ({api, db, user}) => {
  const {events, text} = await chat(api, `[ai:chat-propose] log toast ${user.id}`);
  const action = events.find((event) => event.type === 'action')?.action as {
    id: string;
    kind: string;
    status: string;
    entry: Record<string, unknown>;
  };
  expect(action).toMatchObject({
    kind: 'food',
    status: 'pending',
    entry: {name: FOOD_ESTIMATE.name, calories: FOOD_ESTIMATE.calories},
  });
  expect(text).toBe(`I've proposed ${FOOD_ESTIMATE.name} for you to confirm.`);
  expect(await db.foodLog.count({where: {userId: user.id}})).toBe(0);

  const confirmed = await api.post(`/api/chat/actions/${action.id}`, {
    data: {decision: 'confirm'},
  });
  expect(confirmed.status()).toBe(200);
  const {resultId} = await confirmed.json();
  const food = await db.foodLog.findUniqueOrThrow({where: {id: resultId}});
  expect(food).toMatchObject({
    userId: user.id,
    name: FOOD_ESTIMATE.name,
    calories: FOOD_ESTIMATE.calories,
    protein: FOOD_ESTIMATE.protein,
  });

  const again = await api.post(`/api/chat/actions/${action.id}`, {
    data: {decision: 'confirm'},
  });
  expect(again.status()).toBe(409);
  expect(await db.foodLog.count({where: {userId: user.id}})).toBe(1);
});

test('CHAT-06 a dismissed entry is never logged', async ({api, db, user}) => {
  const {events} = await chat(api, `[ai:chat-propose] log toast ${user.id}`);
  const {id} = events.find((event) => event.type === 'action')?.action as {id: string};

  const dismissed = await api.post(`/api/chat/actions/${id}`, {data: {decision: 'dismiss'}});
  expect(await dismissed.json()).toEqual({status: 'dismissed'});
  const late = await api.post(`/api/chat/actions/${id}`, {data: {decision: 'confirm'}});
  expect(late.status()).toBe(409);
  expect(await db.foodLog.count({where: {userId: user.id}})).toBe(0);
  expect(
    (await api.post(`/api/chat/actions/${id}`, {data: {decision: 'maybe'}})).status(),
  ).toBe(400);
});

test('CHAT-07 threads and entries are private to their owner', async ({
  api,
  apiAs,
  makeUser,
  db,
  user,
}) => {
  const {events, threadId} = await chat(api, `[ai:chat-propose] mine ${user.id}`);
  const {id: actionId} = events.find((event) => event.type === 'action')?.action as {
    id: string;
  };

  const intruder = await apiAs(await makeUser());
  expect((await intruder.get(`/api/chat/threads/${threadId}`)).status()).toBe(404);
  expect((await intruder.delete(`/api/chat/threads/${threadId}`)).status()).toBe(404);
  expect(
    (await intruder.post('/api/chat', {data: {threadId, message: 'hijack'}})).status(),
  ).toBe(404);
  expect(
    (
      await intruder.post(`/api/chat/actions/${actionId}`, {data: {decision: 'confirm'}})
    ).status(),
  ).toBe(404);
  expect(await (await intruder.get('/api/chat/threads')).json()).toEqual([]);
  expect(await db.foodLog.count({where: {userId: user.id}})).toBe(0);
  expect(await db.chatAction.findUniqueOrThrow({where: {id: actionId}})).toMatchObject({
    status: 'pending',
  });

  // The owner can delete it, taking messages and entries with it.
  expect((await api.delete(`/api/chat/threads/${threadId}`)).status()).toBe(204);
  expect(await db.chatMessage.count({where: {threadId}})).toBe(0);
  expect(await db.chatAction.count({where: {threadId}})).toBe(0);
});

test('CHAT-08 an AI failure ends with an error and no reply saved', async ({api, db, user}) => {
  const {events, threadId} = await chat(api, `[ai:chat-error] hi ${user.id}`);
  expect(events.map((event) => event.type)).toEqual(['thread', 'error', 'done']);
  expect(events[1].message).toMatch(/could not answer/);
  expect(
    await db.chatMessage.findMany({where: {threadId}, select: {role: true}}),
  ).toEqual([{role: 'user'}]);
});
