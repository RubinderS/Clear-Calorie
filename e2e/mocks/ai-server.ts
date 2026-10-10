// Stands in for the OpenAI-compatible AI service and the Resend email API so
// the app never reaches a real one. Responses are picked by a `[ai:<scenario>]`
// marker in the prompt, which keeps parallel tests independent.
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {MOCK_PORT} from '../env';
import {
  EXERCISE_ESTIMATE,
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
      name: 'N'.repeat(80),
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

async function handleCompletion(req: IncomingMessage, res: ServerResponse) {
  const body = (await readBody(req)) as RecordedRequest['body'];
  requests.push({
    at: Date.now(),
    authorization: req.headers.authorization ?? null,
    body,
  });

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

  const isExercise = system.startsWith('You are an exercise');
  const payload = isExercise
    ? scenario === 'missing-calories'
      ? {assumptions: 'No idea.'}
      : EXERCISE_ESTIMATE
    : foodResponse(scenario, system.includes('<health_notes>'));
  const content = JSON.stringify(payload);

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
        r.body.messages.some((m) => m.role === 'user' && m.content.includes(contains)),
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
