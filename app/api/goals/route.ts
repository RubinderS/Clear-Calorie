import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {upsertGoals} from '@/lib/data/goals';

const notes = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

const goalsSchema = z.object({
  calorieGoal: z.number().int().min(0).optional(),
  proteinGoal: z.number().int().min(0).optional(),
  carbsGoal: z.number().int().min(0).optional(),
  fatGoal: z.number().int().min(0).optional(),
  saturatedFatGoal: z.number().int().min(0).optional(),
  healthNotes: notes,
  foodPreferences: notes,
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

    // Each goals card submits only its own fields, so merge with defaults on create.
    const goals = await upsertGoals(session.user.id, parsed.data);

    return NextResponse.json(goals);
  } catch {
    return NextResponse.json({error: 'Failed to update goals'}, {status: 500});
  }
}
