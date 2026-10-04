import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {AiError, estimateFood, isAiEnabled} from '@/lib/ai';
import {prisma} from '@/lib/prisma';
import {aiRateLimit, rateLimitByKey} from '@/lib/rate-limit';

const estimateRequestSchema = z.object({
  description: z.string().trim().min(1).max(300),
});

export async function POST(request: Request) {
  if (!isAiEnabled()) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const rateLimit = await rateLimitByKey(
    `user:${session.user.id}`,
    aiRateLimit,
  );
  if (!rateLimit.success) {
    return NextResponse.json(
      {error: 'Too many AI requests. Please try again later.'},
      {status: 429, headers: rateLimit.headers},
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = estimateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid input'}, {status: 400});
  }

  try {
    // Read from the DB rather than the request so notes can't be spoofed per call.
    const goal = await prisma.goal.findUnique({
      where: {userId: session.user.id},
      select: {healthNotes: true},
    });
    const estimate = await estimateFood(
      parsed.data.description,
      goal?.healthNotes,
    );
    return NextResponse.json(estimate);
  } catch (error) {
    if (error instanceof AiError) {
      console.error('AI food estimate failed:', error.message);
    } else {
      console.error('AI food estimate failed:', error);
    }
    return NextResponse.json(
      {error: 'Could not estimate this food. Please enter values manually.'},
      {status: 502},
    );
  }
}
