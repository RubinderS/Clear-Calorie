import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
  EXERCISE_NOTES_MAX,
  exerciseGoalInputSchema,
  normalizeNotes,
} from '@/lib/exercise';
import {
  ExerciseGoalNotFoundError,
  deleteExerciseGoal,
  saveExerciseGoal,
} from '@/lib/exercise-plan';
import {listExerciseGoals, updateExerciseGoal} from '@/lib/data/exercise-goals';
import {getUserTimeZone} from '@/lib/timezone';
import {MAX_TEMPO_MS, MIN_TEMPO_MS} from '@/lib/workout';

const exerciseGoalSchema = z
  .object({id: z.string().optional()})
  .and(exerciseGoalInputSchema);

const workoutSettingsSchema = z
  .object({
    id: z.string().min(1),
    tempoMs: z.number().int().min(MIN_TEMPO_MS).max(MAX_TEMPO_MS).optional(),
    notes: z.string().max(EXERCISE_NOTES_MAX).nullish(),
  })
  .refine((data) => data.tempoMs !== undefined || data.notes !== undefined);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const goals = await listExerciseGoals(session.user.id);

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

    const {id} = parsed.data;
    const goal = await saveExerciseGoal(
      session.user.id,
      await getUserTimeZone(),
      parsed.data,
      id ? {id} : undefined,
    );
    return NextResponse.json(goal, {status: id ? 200 : 201});
  } catch (error) {
    if (error instanceof ExerciseGoalNotFoundError) {
      return NextResponse.json({error: 'Goal not found'}, {status: 404});
    }
    return NextResponse.json(
      {error: 'Failed to save exercise goal'},
      {status: 500},
    );
  }
}

/**
 * Updates the workout tempo or notes for a goal from the workout screen.
 * Neither changes what's planned, so no freeze.
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const parsed = workoutSettingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const {id, tempoMs, notes} = parsed.data;
    const goal = await updateExerciseGoal(session.user.id, id, {
      tempoMs,
      ...(notes !== undefined && {notes: normalizeNotes(notes)}),
    });
    if (!goal) {
      return NextResponse.json({error: 'Goal not found'}, {status: 404});
    }

    return new NextResponse(null, {status: 204});
  } catch {
    return NextResponse.json(
      {error: 'Failed to save workout settings'},
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

  try {
    await deleteExerciseGoal(session.user.id, await getUserTimeZone(), id);
  } catch (error) {
    if (error instanceof ExerciseGoalNotFoundError) {
      return NextResponse.json({error: 'Goal not found'}, {status: 404});
    }
    throw error;
  }

  return new NextResponse(null, {status: 204});
}
