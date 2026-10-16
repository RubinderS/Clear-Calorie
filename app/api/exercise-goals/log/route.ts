import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {authOptions} from '@/lib/auth-options';
import {
  EXERCISE_LOG_INCLUDE,
  exerciseSetsSchema,
  isActiveOn,
  setsOf,
  toExerciseFields,
  toSetRows,
  type ExerciseSet,
} from '@/lib/exercise';
import {prisma} from '@/lib/prisma';
import {getTodayDate, getTodayWeekday, getUserTimeZone} from '@/lib/timezone';

// Details override the goal's when the user changed them before logging, e.g.
// a heavier last set. durationMin is the older way to change a single timed set.
const tickSchema = z.object({
  goalId: z.string().min(1),
  exerciseSets: exerciseSetsSchema.optional(),
  durationMin: z.number().int().min(1).optional(),
  calories: z.number().int().min(0).optional(),
});

/** The goal's sets, with a single timed set's time changed if asked. */
function plannedSetsWith(
  planned: ExerciseSet[],
  durationMin: number | undefined,
): ExerciseSet[] {
  const [only] = planned;
  if (durationMin === undefined || planned.length !== 1 || only.reps != null) {
    return planned;
  }
  return [{...only, durationSec: durationMin * 60}];
}

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
    const {goalId, exerciseSets, durationMin, calories} = parsed.data;

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
    const sets = exerciseSets ?? plannedSetsWith(setsOf(goal), durationMin);
    const fields = toExerciseFields(sets);
    try {
      const entry = await prisma.exerciseLog.create({
        data: {
          userId,
          exerciseGoalId: goalId,
          goalDate,
          name: goal.name,
          calories: calories ?? goal.calories,
          ...fields,
          durationMin: fields.durationMin ?? 0,
          exerciseSets: {create: toSetRows(sets)},
        },
        include: EXERCISE_LOG_INCLUDE,
      });
      return NextResponse.json(entry, {status: 201});
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await prisma.exerciseLog.findUnique({
          where: {exerciseGoalId_goalDate: {exerciseGoalId: goalId, goalDate}},
          include: EXERCISE_LOG_INCLUDE,
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
