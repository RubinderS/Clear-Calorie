import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {authOptions} from '@/lib/auth-options';
import {isActiveOn} from '@/lib/exercise';
import {prisma} from '@/lib/prisma';
import {MAX_REPS} from '@/lib/workout';
import {getTodayDate, getTodayWeekday, getUserTimeZone} from '@/lib/timezone';

// Sets and reps override the goal's for strength goals, e.g. from a workout
// session where the user changed them.
const tickSchema = z.object({
  goalId: z.string().min(1),
  sets: z.number().int().min(1).optional(),
  reps: z.number().int().min(1).max(MAX_REPS).optional(),
});

/** Ticks off a planned exercise for today by logging it from the goal. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  const userId = session.user.id;

  try {
    const parsed = tickSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }
    const {goalId, sets, reps} = parsed.data;

    const goal = await prisma.exerciseGoal.findFirst({
      where: {id: goalId, userId},
    });
    if (!goal) {
      return NextResponse.json({error: 'Goal not found'}, {status: 404});
    }

    const timeZone = await getUserTimeZone();
    if (!isActiveOn(goal.daysMask, getTodayWeekday(timeZone))) {
      return NextResponse.json(
        {error: 'This exercise is not planned for today'},
        {status: 400},
      );
    }

    const goalDate = getTodayDate(timeZone);
    try {
      const entry = await prisma.exerciseLog.create({
        data: {
          userId,
          exerciseGoalId: goalId,
          goalDate,
          name: goal.name,
          type: goal.type,
          calories: goal.calories,
          durationMin: goal.durationMin ?? 0,
          ...(goal.type === 'STRENGTH'
            ? {sets: sets ?? goal.sets, reps: reps ?? goal.reps}
            : {sets: goal.sets, reps: goal.reps}),
          weight: goal.weight,
        },
      });
      return NextResponse.json(entry, {status: 201});
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await prisma.exerciseLog.findUnique({
          where: {exerciseGoalId_goalDate: {exerciseGoalId: goalId, goalDate}},
        });
        return NextResponse.json(existing);
      }
      throw error;
    }
  } catch {
    return NextResponse.json(
      {error: 'Failed to log planned exercise'},
      {status: 500},
    );
  }
}

/** Unticks a planned exercise by removing today's log created from it. */
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const goalId = new URL(request.url).searchParams.get('goalId');
  if (!goalId) {
    return NextResponse.json({error: 'Goal ID is required'}, {status: 400});
  }

  const result = await prisma.exerciseLog.deleteMany({
    where: {
      userId: session.user.id,
      exerciseGoalId: goalId,
      goalDate: getTodayDate(await getUserTimeZone()),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({error: 'Entry not found'}, {status: 404});
  }

  return new NextResponse(null, {status: 204});
}
