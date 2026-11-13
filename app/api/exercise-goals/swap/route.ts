import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
  DaySwapError,
  getWeekSwapOverview,
  resetWeekSwaps,
  swapWeekDays,
} from '@/lib/exercise-plan';
import {getUserTimeZone} from '@/lib/timezone';

const weekday = z.number().int().min(0).max(6);
const swapSchema = z.object({a: weekday, b: weekday});

/** This week's days and what each is planned to do after swaps. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  return NextResponse.json(
    await getWeekSwapOverview(session.user.id, await getUserTimeZone()),
  );
}

/** Trades two weekdays' workouts for this week only. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const parsed = swapSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }
    const timeZone = await getUserTimeZone();
    await swapWeekDays(session.user.id, timeZone, parsed.data.a, parsed.data.b);
    return NextResponse.json(await getWeekSwapOverview(session.user.id, timeZone));
  } catch (error) {
    if (error instanceof DaySwapError) {
      return NextResponse.json({error: error.message}, {status: 400});
    }
    return NextResponse.json({error: 'Failed to swap days'}, {status: 500});
  }
}

/** Puts this week's remaining days back on their own workouts. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const timeZone = await getUserTimeZone();
    await resetWeekSwaps(session.user.id, timeZone);
    return NextResponse.json(await getWeekSwapOverview(session.user.id, timeZone));
  } catch {
    return NextResponse.json({error: 'Failed to reset swaps'}, {status: 500});
  }
}
