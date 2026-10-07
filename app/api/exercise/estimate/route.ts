import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {AiError, estimateExercise, isAiEnabled} from '@/lib/ai';
import {EXERCISE_TYPES} from '@/lib/exercise';
import {prisma} from '@/lib/prisma';
import {aiRateLimit, rateLimitByKey} from '@/lib/rate-limit';

const positiveInt = z.number().int().min(1).max(10_000).nullish();

// Looser than exerciseDetailsSchema so a partly filled form can be estimated.
const estimateRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(EXERCISE_TYPES),
  durationMin: positiveInt,
  sets: positiveInt,
  reps: positiveInt,
  weight: z.number().positive().max(10_000).nullish(),
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
    const latestWeight = await prisma.weightLog.findFirst({
      where: {userId: session.user.id},
      orderBy: {loggedAt: 'desc'},
      select: {weight: true},
    });
    const estimate = await estimateExercise(
      parsed.data,
      latestWeight?.weight ?? null,
    );
    return NextResponse.json(estimate);
  } catch (error) {
    if (error instanceof AiError) {
      console.error('AI exercise estimate failed:', error.message);
    } else {
      console.error('AI exercise estimate failed:', error);
    }
    return NextResponse.json(
      {
        error:
          'Could not estimate this exercise. Please enter calories manually.',
      },
      {status: 502},
    );
  }
}
