import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {authOptions} from '@/lib/auth-options';
import {exerciseDetailsSchema, toExerciseFields} from '@/lib/exercise';
import {prisma} from '@/lib/prisma';

const savedExerciseSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1),
    calories: z.number().int().min(0),
    isPinned: z.boolean().default(false),
  })
  .and(exerciseDetailsSchema);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const items = await prisma.savedExerciseItem.findMany({
      where: {userId: session.user.id},
      orderBy: {name: 'asc'},
    });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      {error: 'Failed to fetch saved exercise items'},
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
    const parsed = savedExerciseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const {id, name, calories, isPinned} = parsed.data;
    const fields = toExerciseFields(parsed.data);
    const data = {
      name,
      calories,
      isPinned,
      ...fields,
      durationMin: fields.durationMin ?? 0,
    };

    const existing = await prisma.savedExerciseItem.findUnique({
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

    const item = await prisma.savedExerciseItem.upsert({
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
      {error: 'Failed to save exercise item'},
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

    await prisma.savedExerciseItem.deleteMany({
      where: {id, userId: session.user.id},
    });

    return NextResponse.json({success: true});
  } catch {
    return NextResponse.json(
      {error: 'Failed to delete saved exercise item'},
      {status: 500},
    );
  }
}
