import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';

const savedFoodSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    calories: z.number().finite().min(0),
    protein: z.number().finite().min(0).default(0),
    carbs: z.number().finite().min(0).default(0),
    fat: z.number().finite().min(0).default(0),
    saturatedFat: z.number().finite().min(0).default(0),
    isPinned: z.boolean().default(false),
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const items = await prisma.savedFoodItem.findMany({
      where: {userId: session.user.id},
      orderBy: {name: 'asc'},
    });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      {error: 'Failed to fetch saved food items'},
      {status: 500},
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const body = await request.json();
    const parsed = savedFoodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const {id, ...data} = parsed.data;

    const existing = await prisma.savedFoodItem.findUnique({
      where: {
        userId_name: {
          userId: session.user.id,
          name: data.name,
        },
      },
    });

    if (existing && existing.id !== id) {
      return NextResponse.json(
        {error: 'An item with this name already exists'},
        {status: 400},
      );
    }

    const item = await prisma.savedFoodItem.upsert({
      where: {
        userId_name: {
          userId: session.user.id,
          name: data.name,
        },
      },
      update: data,
      create: {
        ...data,
        userId: session.user.id,
      },
    });

    return NextResponse.json(item, {status: 201});
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return NextResponse.json(
        {error: 'An item with this name already exists'},
        {status: 400},
      );
    }
    return NextResponse.json(
      {error: 'Failed to save food item'},
      {status: 500},
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const {searchParams} = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({error: 'Missing id'}, {status: 400});
    }

    await prisma.savedFoodItem.deleteMany({
      where: {id, userId: session.user.id},
    });

    return NextResponse.json({success: true});
  } catch {
    return NextResponse.json(
      {error: 'Failed to delete saved food item'},
      {status: 500},
    );
  }
}
