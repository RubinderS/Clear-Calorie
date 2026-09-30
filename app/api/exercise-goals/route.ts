import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
  daysToMask,
  exerciseDetailsSchema,
  toExerciseFields,
} from '@/lib/exercise';
import {prisma} from '@/lib/prisma';

const exerciseGoalSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    calories: z.number().int().min(0),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((days) => new Set(days).size === days.length),
  })
  .and(exerciseDetailsSchema);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const goals = await prisma.exerciseGoal.findMany({
    where: {userId: session.user.id},
    orderBy: {createdAt: 'asc'},
  });

  return NextResponse.json(goals);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const body = await request.json();
    const parsed = exerciseGoalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const {id, name, calories, days} = parsed.data;
    const data = {
      name,
      calories,
      daysMask: daysToMask(days),
      ...toExerciseFields(parsed.data),
    };

    if (id) {
      const result = await prisma.exerciseGoal.updateMany({
        where: {id, userId: session.user.id},
        data,
      });
      if (result.count === 0) {
        return NextResponse.json({error: 'Goal not found'}, {status: 404});
      }
      const goal = await prisma.exerciseGoal.findUnique({where: {id}});
      return NextResponse.json(goal);
    }

    const goal = await prisma.exerciseGoal.create({
      data: {...data, userId: session.user.id},
    });

    return NextResponse.json(goal, {status: 201});
  } catch {
    return NextResponse.json(
      {error: 'Failed to save exercise goal'},
      {status: 500},
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({error: 'Goal ID is required'}, {status: 400});
  }

  const result = await prisma.exerciseGoal.deleteMany({
    where: {id, userId: session.user.id},
  });

  if (result.count === 0) {
    return NextResponse.json({error: 'Goal not found'}, {status: 404});
  }

  return new NextResponse(null, {status: 204});
}
