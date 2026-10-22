// Stands in for the OpenAI-compatible AI service and the Resend email API so
// the app never reaches a real one. Responses are picked by a `[ai:<scenario>]`
// marker in the prompt, which keeps parallel tests independent.
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {MOCK_PORT} from '../env';
import {
  FOOD_ESTIMATE,
  HEALTH_ALERTS,
  type RecordedEmail,
  type RecordedRequest,
} from './data';

const requests: RecordedRequest[] = [];
const emails: RecordedEmail[] = [];

function completion(content: string) {
  return {choices: [{message: {role: 'assistant', content}}]};
}

function foodResponse(scenario: string | undefined, hasHealthNotes: boolean) {
  let estimate: Record<string, unknown> = {...FOOD_ESTIMATE};
  if (scenario === 'missing-calories') {
    delete estimate.calories;
  } else if (scenario === 'overflow') {
    estimate = {
      ...estimate,
      name: 'N'.repeat(120),
      calories: 512.6,
      protein: 12.345,
      fat: 10,
      saturatedFat: 15,
    };
  } else if (scenario === 'strings') {
    estimate = {...estimate, calories: '250', protein: '7.5'};
  }

  if (hasHealthNotes) {
    estimate.healthAlert =
      scenario === 'avoid' || scenario === 'caution'
        ? HEALTH_ALERTS[scenario]
        : scenario === 'bad-alert'
          ? {level: 'terrible', message: 42}
          : {level: 'ok', message: ''};
  }
  return estimate;
}

function respondJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : null;
}

type ChatMessage = {
  role: string;
  content: string | null;
  tool_calls?: {id: string; function: {name: string; arguments: string}}[];
};

/**
 * Streams chunks as server-sent events, the way providers stream replies,
 * optionally pausing between them so a test can act mid-reply.
 */
async function respondStream(res: ServerResponse, chunks: unknown[], delayMs = 0) {
  res.writeHead(200, {'Content-Type': 'text/event-stream'});
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  res.end('data: [DONE]\n\n');
}

const textChunks = (text: string) => [
  ...text.split(/(?<= )/).map((part) => ({choices: [{delta: {content: part}}]})),
  {choices: [{delta: {}, finish_reason: 'stop'}]},
];

const toolCallChunks = (id: string, name: string, args: unknown) => {
  const json = JSON.stringify(args);
  const half = Math.floor(json.length / 2);
  // Split the arguments like real providers do.
  return [
    {choices: [{delta: {tool_calls: [{index: 0, id, type: 'function', function: {name, arguments: json.slice(0, half)}}]}}]},
    {choices: [{delta: {tool_calls: [{index: 0, function: {arguments: json.slice(half)}}]}}]},
    {choices: [{delta: {}, finish_reason: 'tool_calls'}]},
  ];
};

/**
 * The coach chat. The scenario comes from the latest user message: the first
 * call asks for a tool, and once its result is in, the reply quotes it.
 */
function handleChat(res: ServerResponse, messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const scenario = /\[ai:([a-z0-9-]+)\]/.exec(lastUser?.content ?? '')?.[1];
  const last = messages.at(-1);

  if (scenario === 'chat-error') {
    return respondJson(res, 500, {error: {message: 'mock failure'}});
  }

  if (last?.role === 'tool') {
    const result = JSON.parse(last.content ?? '{}');
    // Reads the plan, then adds 2.5 kg to its first exercise.
    if (scenario === 'chat-plan' && result.plan) {
      const [first] = result.plan;
      return respondStream(
        res,
        toolCallChunks('call_plan_change', 'propose_exercise_plan_change', {
          operation: 'update',
          exerciseId: first?.id,
          weight: 62.5,
        }),
      );
    }
    // Reads the plan, then matches its first unlinked exercise to the push-up.
    if (scenario === 'chat-links' && result.plan) {
      const unlinked = result.plan.find((item: {catalogId?: string}) => !item.catalogId);
      return respondStream(
        res,
        toolCallChunks('call_links', 'propose_exercise_catalog_links', {
          links: [{exerciseId: unlinked?.id, catalogId: 'push-up'}],
        }),
      );
    }
    if (scenario === 'chat-links') {
      return respondStream(
        res,
        textChunks(result.error ?? `I've proposed matching ${result.proposed?.[0]?.from} to ${result.proposed?.[0]?.to}.`),
      );
    }
    if (scenario === 'chat-plan') {
      return respondStream(
        res,
        textChunks(result.error ?? `I've proposed a change to ${result.proposed?.name} for you to confirm.`),
      );
    }
    if (scenario === 'chat-sequence') {
      return respondStream(
        res,
        textChunks(result.error ?? `I've proposed ${result.proposed?.name} for you to confirm.`),
      );
    }
    const text =
      scenario === 'chat-propose'
        ? `I've proposed ${result.proposed?.name ?? 'nothing'} for you to confirm.`
        : `You logged food on ${result.summary?.daysLogged ?? 0} days, averaging **${result.summary?.avgProtein ?? 0} g** protein.`;
    return respondStream(res, textChunks(text));
  }

  if (scenario === 'chat-tool') {
    return respondStream(
      res,
      toolCallChunks('call_totals', 'get_daily_totals', {}),
    );
  }
  if (scenario === 'chat-propose') {
    return respondStream(
      res,
      toolCallChunks('call_food', 'propose_food_log', {description: 'mock toast'}),
    );
  }
  // Builds a whole sequence in one proposal.
  if (scenario === 'chat-sequence') {
    return respondStream(
      res,
      toolCallChunks('call_sequence', 'propose_exercise_plan_change', {
        operation: 'add',
        name: 'Cardio circuit',
        days: ['Monday'],
        calories: 90,
        steps: [
          {catalogId: 'jumping-jack', durationSec: 45},
          {catalogId: 'goblet-squat', reps: 12, restSec: 30},
        ],
      }),
    );
  }
  if (scenario === 'chat-plan' || scenario === 'chat-links') {
    return respondStream(res, toolCallChunks('call_plan', 'get_exercise_plan', {}));
  }
  if (scenario === 'chat-slow') {
    return respondStream(
      res,
      textChunks('This reply streams in slowly, one word at a time, so it can be expanded midway.'),
      400,
    );
  }
  return respondStream(res, textChunks('Hello from the mock coach.'));
}

async function handleCompletion(req: IncomingMessage, res: ServerResponse) {
  const body = (await readBody(req)) as RecordedRequest['body'];
  requests.push({
    at: Date.now(),
    authorization: req.headers.authorization ?? null,
    body,
  });

  if (body.stream) {
    return handleChat(res, body.messages as unknown as ChatMessage[]);
  }

  const system = body.messages.find((m) => m.role === 'system')?.content ?? '';
  const user = body.messages.find((m) => m.role === 'user')?.content ?? '';
  const scenario = /\[ai:([a-z0-9-]+)\]/.exec(user)?.[1];

  if (scenario === 'error500') {
    return respondJson(res, 500, {error: {message: 'mock failure'}});
  }
  if (scenario === 'empty') {
    return respondJson(res, 200, {choices: []});
  }
  if (scenario === 'invalid') {
    return respondJson(res, 200, completion('Sorry, I cannot help with that.'));
  }

  const content = JSON.stringify(
    foodResponse(scenario, system.includes('<health_notes>')),
  );

  respondJson(
    res,
    200,
    completion(scenario === 'fenced' ? `\`\`\`json\n${content}\n\`\`\`` : content),
  );
}

async function handleEmail(req: IncomingMessage, res: ServerResponse) {
  const body = (await readBody(req)) as Omit<RecordedEmail, 'at' | 'to'> & {
    to: string | string[];
  };
  emails.push({
    at: Date.now(),
    from: body.from,
    to: Array.isArray(body.to) ? body.to : [body.to],
    subject: body.subject,
    html: body.html,
  });
  respondJson(res, 200, {id: `email_${emails.length}`});
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    handleCompletion(req, res).catch(() => respondJson(res, 400, {}));
  } else if (req.method === 'POST' && url.pathname === '/emails') {
    handleEmail(req, res).catch(() => respondJson(res, 400, {}));
  } else if (url.pathname === '/__requests') {
    // Requests whose user message contains `contains`.
    const contains = url.searchParams.get('contains') ?? '';
    respondJson(
      res,
      200,
      requests.filter((r) =>
        r.body.messages.some((m) => m.role === 'user' && m.content?.includes(contains)),
      ),
    );
  } else if (url.pathname === '/__emails') {
    const to = url.searchParams.get('to')?.toLowerCase() ?? '';
    respondJson(
      res,
      200,
      emails.filter((e) => e.to.some((addr) => addr.toLowerCase() === to)),
    );
  } else if (url.pathname === '/__health') {
    respondJson(res, 200, {ok: true});
  } else {
    respondJson(res, 404, {error: 'Not found'});
  }
});

server.listen(MOCK_PORT, '127.0.0.1', () => {
  console.log(`Mock AI/email server on http://127.0.0.1:${MOCK_PORT}`);
});
