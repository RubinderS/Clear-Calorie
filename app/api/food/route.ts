import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
  createFoodLog,
  foodSchema,
  nutritionFields,
  refineSaturatedFat,
} from '@/lib/food';
import {deleteFoodLog, findFoodLog, listFoodLogs, updateFoodLog} from '@/lib/data/food-logs';
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

  const entries = await listFoodLogs(session.user.id, {
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
    const parsed = foodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const entry = await createFoodLog(session.user.id, parsed.data);

    return NextResponse.json(entry, {status: 201});
  } catch {
    return NextResponse.json({error: 'Failed to log food'}, {status: 500});
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

  if (!(await deleteFoodLog(session.user.id, entryId))) {
    return NextResponse.json({error: 'Entry not found'}, {status: 404});
  }

  return new NextResponse(null, {status: 204});
}

// Corrects a logged entry, e.g. a smaller portion or better nutrition numbers.
const updateSchema = z
  .object({id: z.string().min(1), ...nutritionFields})
  .superRefine(refineSaturatedFat);

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
    const {id, ...food} = parsed.data;

    const entry = await findFoodLog(session.user.id, id);
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

    const updated = await updateFoodLog(id, food);

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({error: 'Failed to update food'}, {status: 500});
  }
}
