import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getDateRange, getUserTimeZone} from '@/lib/timezone';

const foodSchema = z
  .object({
    name: z.string().min(1),
    calories: z.number().int().min(0),
    protein: z.number().int().min(0).default(0),
    carbs: z.number().int().min(0).default(0),
    fat: z.number().int().min(0).default(0),
    saturatedFat: z.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.saturatedFat > data.fat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Saturated fat cannot exceed total fat',
        path: ['saturatedFat'],
      });
    }
  });

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

    const entry = await prisma.foodLog.create({
      data: {
        ...parsed.data,
        userId: session.user.id,
      },
    });

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
