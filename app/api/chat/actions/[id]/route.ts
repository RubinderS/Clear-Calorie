import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {format} from 'date-fns';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {planChangeSchema} from '@/lib/chat/plan-change';
import {parseActionPayload} from '@/lib/chat/view';
import {
  PlannedExerciseError,
  createExerciseLog,
  exerciseLogSchema,
} from '@/lib/exercise-log';
import {
  ExerciseGoalNotFoundError,
  deleteExerciseGoal,
  saveExerciseGoal,
} from '@/lib/exercise-plan';
import {createFoodLog, foodSchema} from '@/lib/food';
import {prisma} from '@/lib/prisma';
import {getTodayDate, getUserTimeZone, toZoned} from '@/lib/timezone';
import {createWeightLog, weightSchema} from '@/lib/weight';

const decisionSchema = z.object({
  decision: z.enum(['confirm', 'dismiss']),
});

class InvalidEntryError extends Error {}

/**
 * Creates the entry, or makes the plan change, a confirmed action describes,
 * with the same validation as the log and plan APIs.
 */
async function createEntry(
  userId: string,
  kind: string,
  entry: unknown,
): Promise<string> {
  if (kind === 'food') {
    const parsed = foodSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    return (await createFoodLog(userId, parsed.data)).id;
  }
  if (kind === 'exercise') {
    const parsed = exerciseLogSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const timeZone = await getUserTimeZone();
    return (await createExerciseLog(userId, timeZone, parsed.data)).id;
  }
  if (kind === 'weight') {
    const parsed = weightSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    return (await createWeightLog(userId, parsed.data)).id;
  }
  if (kind === 'plan') {
    const parsed = planChangeSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const change = parsed.data;
    const timeZone = await getUserTimeZone();
    if (change.operation === 'add') {
      return (await saveExerciseGoal(userId, timeZone, change.goal)).id;
    }
    // Only the goal as proposed, so a later edit isn't overwritten.
    const updatedAt = new Date(change.updatedAt);
    if (change.operation === 'update') {
      const target = {id: change.goalId, updatedAt};
      return (await saveExerciseGoal(userId, timeZone, change.goal, target)).id;
    }
    await deleteExerciseGoal(userId, timeZone, change.goalId, updatedAt);
    return change.goalId;
  }
  throw new InvalidEntryError();
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{id: string}>},
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  const userId = session.user.id;

  const parsed = decisionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid input'}, {status: 400});
  }
  const confirm = parsed.data.decision === 'confirm';

  const {id} = await params;
  const action = await prisma.chatAction.findFirst({where: {id, userId}});
  if (!action) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  // Entries are logged for today, so a card from an earlier day can't be
  // confirmed; it would count towards the wrong day. Plan changes aren't
  // tied to a day.
  if (confirm && action.status === 'pending' && action.kind !== 'plan') {
    const timeZone = await getUserTimeZone();
    const proposedOn = format(toZoned(action.createdAt, timeZone), 'yyyy-MM-dd');
    if (proposedOn !== getTodayDate(timeZone)) {
      return NextResponse.json(
        {error: 'This was proposed on an earlier day. Ask the coach to log it again.'},
        {status: 409},
      );
    }
  }

  // Claim the action first so a double tap can't log the entry twice.
  const claimed = await prisma.chatAction.updateMany({
    where: {id, userId, status: 'pending'},
    data: {status: confirm ? 'confirmed' : 'dismissed', resolvedAt: new Date()},
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      {error: 'This entry was already handled'},
      {status: 409},
    );
  }

  if (!confirm) {
    return NextResponse.json({status: 'dismissed'});
  }

  let resultId: string;
  try {
    resultId = await createEntry(
      userId,
      action.kind,
      parseActionPayload(action.payload).entry,
    );
  } catch (error) {
    // Put it back so the user can try again or dismiss it.
    await prisma.chatAction.update({
      where: {id},
      data: {status: 'pending', resolvedAt: null},
    });
    if (error instanceof ExerciseGoalNotFoundError) {
      return NextResponse.json(
        {error: 'This exercise was changed or removed since. Ask the coach again.'},
        {status: 409},
      );
    }
    if (error instanceof PlannedExerciseError) {
      return NextResponse.json({error: error.message}, {status: 400});
    }
    if (error instanceof InvalidEntryError) {
      return NextResponse.json(
        {error: 'This entry is not valid'},
        {status: 400},
      );
    }
    return NextResponse.json({error: 'Failed to log entry'}, {status: 500});
  }

  // The entry exists now, so the action stays confirmed even if this fails;
  // putting it back to pending would let it be logged twice.
  await prisma.chatAction
    .update({where: {id}, data: {resultId}})
    .catch((error) => console.error('Failed to link chat action to entry:', error));
  return NextResponse.json({status: 'confirmed', resultId});
}
