import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
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
import {
  deleteExerciseLog,
  findExerciseLog,
  listExerciseLogs,
  updateExerciseLog,
} from '@/lib/data/exercise-logs';
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

  const entries = await listExerciseLogs(session.user.id, {
    loggedAt: {gte: range.start, lte: range.end},
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

  const entry = await findExerciseLog(session.user.id, entryId);
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

  await deleteExerciseLog(session.user.id, entryId);

  return new NextResponse(null, {status: 204});
}

// Corrects what was actually done, e.g. fewer reps or a lighter weight than
// planned, set by set.
const updateSchema = z
  .object({
    id: z.string().min(1),
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
    const {id} = parsed.data;

    const entry = await findExerciseLog(session.user.id, id);
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
    const sets = inputSets(parsed.data).map((set, index) => {
      const old = entry.exerciseSets[index];
      return old ? {...set, name: old.name, catalogId: old.catalogId} : set;
    });
    const fields = toExerciseFields(sets);
    const updated = await updateExerciseLog(
      id,
      {...fields, durationMin: fields.durationMin ?? 0},
      toSetRows(sets),
    );

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      {error: 'Failed to update exercise'},
      {status: 500},
    );
  }
}
