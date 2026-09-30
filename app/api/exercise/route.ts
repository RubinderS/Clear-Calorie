import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
  exerciseDetailsSchema,
  isSameExerciseName,
  toExerciseFields,
} from '@/lib/exercise';
import {getPlannedExerciseGoals} from '@/lib/exercise-plan';
import {prisma} from '@/lib/prisma';
import {getDateRange, getTodayRange, getUserTimeZone} from '@/lib/timezone';

const exerciseSchema = z
  .object({
    name: z.string().trim().min(1),
    calories: z.number().int().min(0),
  })
  .and(exerciseDetailsSchema);

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
    const parsed = exerciseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const {name, calories} = parsed.data;

    const planned = await getPlannedExerciseGoals(
      session.user.id,
      await getUserTimeZone(),
    );
    if (planned.some((goal) => isSameExerciseName(goal.name, name))) {
      return NextResponse.json(
        {
          error: `"${name}" is in today's plan. Tick it off there instead.`,
        },
        {status: 400},
      );
    }

    const fields = toExerciseFields(parsed.data);
    const entry = await prisma.exerciseLog.create({
      data: {
        name,
        calories,
        ...fields,
        durationMin: fields.durationMin ?? 0,
        userId: session.user.id,
      },
    });

    return NextResponse.json(entry, {status: 201});
  } catch {
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
