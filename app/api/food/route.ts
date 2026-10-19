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

  const entries = await prisma.foodLog.findMany({
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

  const result = await prisma.foodLog.deleteMany({
    where: {id: entryId, userId: session.user.id},
  });

  if (result.count === 0) {
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

    const entry = await prisma.foodLog.findFirst({
      where: {id, userId: session.user.id},
      select: {loggedAt: true},
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

    const updated = await prisma.foodLog.update({
      where: {id},
      data: food,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({error: 'Failed to update food'}, {status: 500});
  }
}
