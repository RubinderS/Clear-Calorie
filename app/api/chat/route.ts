import {NextResponse, after} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {isAiEnabled} from '@/lib/ai';
import {threadTitle} from '@/lib/chat/helpers';
import {runChat, type ChatEvent} from '@/lib/chat/run';
import {prisma} from '@/lib/prisma';
import {chatRateLimit, rateLimitByKey} from '@/lib/rate-limit';
import {getUserTimeZone} from '@/lib/timezone';

const chatRequestSchema = z.object({
  threadId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(2000),
  context: z
    .object({
      path: z.string().max(100),
      weekStart: z.string().max(10).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  if (!isAiEnabled()) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid input'}, {status: 400});
  }
  const {threadId, message, context} = parsed.data;

  const rateLimit = await rateLimitByKey(`user:${userId}`, chatRateLimit);
  if (!rateLimit.success) {
    return NextResponse.json(
      {error: 'Too many messages. Please try again later.'},
      {status: 429, headers: rateLimit.headers},
    );
  }

  const thread = threadId
    ? await prisma.chatThread.findFirst({
        where: {id: threadId, userId},
        select: {id: true, title: true},
      })
    : await prisma.chatThread.create({
        data: {userId, title: threadTitle(message)},
        select: {id: true, title: true},
      });
  if (!thread) {
    return NextResponse.json({error: 'Chat not found'}, {status: 404});
  }

  await prisma.chatMessage.create({
    data: {threadId: thread.id, role: 'user', content: message},
  });

  const timeZone = await getUserTimeZone();
  const encoder = new TextEncoder();
  let streamOpen = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatEvent) => {
        if (!streamOpen) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          streamOpen = false;
        }
      };

      // The reply keeps going and is saved even if the client disconnects,
      // e.g. a phone switching apps; the thread shows it when reopened.
      const done = (async () => {
        send({type: 'thread', threadId: thread.id, title: thread.title});
        for await (const event of runChat({
          userId,
          threadId: thread.id,
          timeZone,
          context,
        })) {
          send(event);
        }
      })()
        .catch((error) => console.error('Chat stream failed:', error))
        .finally(() => {
          if (!streamOpen) return;
          streamOpen = false;
          try {
            controller.close();
          } catch {
            // Already closed by a disconnect.
          }
        });
      after(done);
    },
    cancel() {
      streamOpen = false;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
