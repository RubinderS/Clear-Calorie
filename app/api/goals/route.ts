import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';

const goalsSchema = z.object({
  calorieGoal: z.number().int().min(0),
  proteinGoal: z.number().int().min(0),
  carbsGoal: z.number().int().min(0),
  fatGoal: z.number().int().min(0),
  weightGoal: z.number().positive().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const body = await request.json();
    const parsed = goalsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const goals = await prisma.goal.upsert({
      where: {userId: session.user.id},
      update: parsed.data,
      create: {
        ...parsed.data,
        userId: session.user.id,
      },
    });

    return NextResponse.json(goals);
  } catch {
    return NextResponse.json({error: 'Failed to update goals'}, {status: 500});
  }
}
