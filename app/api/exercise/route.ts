import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
  EXERCISE_LOG_INCLUDE,
  exerciseInputSchema,
  inputSets,
  toExerciseFields,
  toSetRows,
} from '@/lib/exercise';
import {
  PlannedExerciseError,
  createExerciseLog,
  exerciseLogSchema,
} from '@/lib/exercise-log';
import {prisma} from '@/lib/prisma';
import {getDateRange, getTodayRange, getUserTimeZone} from '@/lib/timezone';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const date = new URL(request.url).searchParams.get('date');
  const timeZone = await getUserTimeZone();
  const range = date ? getDateRange(date, timeZone) : null;

  if (!range) {
    return NextResponse.json({error: 'Invalid date'}, {status: 400});
  }

  const entries = await prisma.exerciseLog.findMany({
    where: {
      userId: session.user.id,
      loggedAt: {gte: range.start, lte: range.end},
    },
    orderBy: {loggedAt: 'desc'},
    include: EXERCISE_LOG_INCLUDE,
  });

  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const body = await request.json();
    const parsed = exerciseLogSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const entry = await createExerciseLog(
      session.user.id,
      await getUserTimeZone(),
      parsed.data,
    );

    return NextResponse.json(entry, {status: 201});
  } catch (error) {
    if (error instanceof PlannedExerciseError) {
      return NextResponse.json({error: error.message}, {status: 400});
    }
    return NextResponse.json({error: 'Failed to log exercise'}, {status: 500});
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const entryId = new URL(request.url).searchParams.get('id');
  if (!entryId) {
    return NextResponse.json({error: 'Entry ID is required'}, {status: 400});
  }

  const entry = await prisma.exerciseLog.findFirst({
    where: {id: entryId, userId: session.user.id},
    select: {loggedAt: true},
  });
  if (!entry) {
    return NextResponse.json({error: 'Entry not found'}, {status: 404});
  }

  const {start, end} = getTodayRange(await getUserTimeZone());
  if (entry.loggedAt < start || entry.loggedAt > end) {
    return NextResponse.json(
      {error: "Only today's entries can be deleted"},
      {status: 403},
    );
  }

  await prisma.exerciseLog.deleteMany({
    where: {id: entryId, userId: session.user.id},
  });

  return new NextResponse(null, {status: 204});
}

// Corrects what was actually done, e.g. fewer reps or a lighter weight than
// planned, set by set.
const updateSchema = z
  .object({
    id: z.string().min(1),
    calories: z.number().int().min(0),
  })
  .and(exerciseInputSchema);

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }
    const {id, calories} = parsed.data;

    const entry = await prisma.exerciseLog.findFirst({
      where: {id, userId: session.user.id},
      select: {
        loggedAt: true,
        exerciseSets: {
          orderBy: {position: 'asc'},
          select: {name: true, catalogId: true},
        },
      },
    });
    if (!entry) {
      return NextResponse.json({error: 'Entry not found'}, {status: 404});
    }

    const {start, end} = getTodayRange(await getUserTimeZone());
    if (entry.loggedAt < start || entry.loggedAt > end) {
      return NextResponse.json(
        {error: "Only today's entries can be edited"},
        {status: 403},
      );
    }

    // A sequence's sets keep the exercise each one was.
    const sets = inputSets(parsed.data).map((set, index) => ({
      ...set,
      ...entry.exerciseSets[index],
    }));
    const fields = toExerciseFields(sets);
    const updated = await prisma.exerciseLog.update({
      where: {id},
      data: {
        calories,
        ...fields,
        durationMin: fields.durationMin ?? 0,
        exerciseSets: {deleteMany: {}, create: toSetRows(sets)},
      },
      include: EXERCISE_LOG_INCLUDE,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      {error: 'Failed to update exercise'},
      {status: 500},
    );
  }
}
