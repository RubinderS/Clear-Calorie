import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {format} from 'date-fns';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {isValidMetricValue, metricEntrySchema} from '@/lib/body-metrics';
import {catalogLinksSchema, planChangeSchema} from '@/lib/chat/plan-change';
import {parseActionPayload, type ActionPayload} from '@/lib/chat/view';
import {
  AlreadyTickedError,
  PlannedExerciseError,
  createExerciseLog,
  exerciseLogSchema,
  logPastPlannedExercise,
  plannedTickSchema,
  type PastDay,
} from '@/lib/exercise-log';
import {
  ExerciseGoalNotFoundError,
  deleteExerciseGoal,
  linkExerciseGoals,
  saveExerciseGoal,
} from '@/lib/exercise-plan';
import {createFoodLog, foodSchema} from '@/lib/food';
import {
  findChatAction,
  reopenChatAction,
  resolveChatAction,
  setChatActionResult,
} from '@/lib/data/chat';
import {createBodyMetricLogs, findBodyMetric} from '@/lib/data/body-metrics';
import {getLogTime, getTodayDate, getUserTimeZone, toZoned} from '@/lib/timezone';
import {createWeightLog, weightSchema} from '@/lib/weight';

const decisionSchema = z.object({
  decision: z.enum(['confirm', 'dismiss']),
});

class InvalidEntryError extends Error {}

/** A 409 whose message tells the user what changed since the proposal. */
class ConflictError extends Error {}

/**
 * When a log entry is logged: now for today, else on the proposed earlier
 * day, with `pastDay` set. Older payloads without a date log now.
 */
function logTimeOf({date, time}: ActionPayload, timeZone: string) {
  if (!date) return {};
  const today = getTodayDate(timeZone);
  const loggedAt = getLogTime(date, time, timeZone);
  if (!loggedAt || date > today) throw new InvalidEntryError();
  const pastDay: PastDay | undefined = date < today ? {date, loggedAt} : undefined;
  return {loggedAt, pastDay};
}

/**
 * Creates the entry, or makes the plan change, a confirmed action describes,
 * with the same validation as the log and plan APIs.
 */
async function createEntry(
  userId: string,
  kind: string,
  payload: ActionPayload,
): Promise<string> {
  const {entry} = payload;
  const timeZone = await getUserTimeZone();
  if (kind === 'food') {
    const parsed = foodSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const {loggedAt} = logTimeOf(payload, timeZone);
    return (await createFoodLog(userId, parsed.data, loggedAt)).id;
  }
  if (kind === 'exercise') {
    const parsed = exerciseLogSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const {pastDay} = logTimeOf(payload, timeZone);
    return (await createExerciseLog(userId, timeZone, parsed.data, pastDay)).id;
  }
  if (kind === 'planned') {
    const parsed = plannedTickSchema.safeParse(entry);
    const {pastDay} = logTimeOf(payload, timeZone);
    // Today's planned exercises are ticked off on the dashboard.
    if (!parsed.success || !pastDay) throw new InvalidEntryError();
    return (await logPastPlannedExercise(userId, timeZone, parsed.data, pastDay)).id;
  }
  if (kind === 'weight') {
    const parsed = weightSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const {loggedAt} = logTimeOf(payload, timeZone);
    return (await createWeightLog(userId, parsed.data, loggedAt)).id;
  }
  if (kind === 'metric') {
    const parsed = metricEntrySchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const {metricId, value} = parsed.data;
    const metric = await findBodyMetric(userId, metricId);
    if (!metric) throw new ConflictError('This measurement was deleted since. Ask the coach again.');
    if (metric.archivedAt) throw new ConflictError('This measurement is archived.');
    if (!isValidMetricValue(metric, value)) throw new InvalidEntryError();
    const {loggedAt} = logTimeOf(payload, timeZone);
    const [log] = await createBodyMetricLogs([{metricId, value}], loggedAt ?? new Date());
    return log.id;
  }
  if (kind === 'plan') {
    const parsed = planChangeSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const change = parsed.data;
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
  if (kind === 'links') {
    const parsed = catalogLinksSchema.safeParse(entry);
    if (!parsed.success) throw new InvalidEntryError();
    const links = parsed.data.links.map((link) => ({...link, updatedAt: new Date(link.updatedAt)}));
    await linkExerciseGoals(userId, links);
    return links[0].goalId;
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
  const action = await findChatAction(userId, id);
  if (!action) {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  // Entries are logged for the day their card names. Older cards without one
  // were for the day they were proposed, but log now, so one from an earlier
  // day can't be confirmed; it would count towards the wrong day. Plan
  // changes aren't tied to a day.
  const payload = parseActionPayload(action.payload);
  const isPlanAction = action.kind === 'plan' || action.kind === 'links';
  if (confirm && action.status === 'pending' && !isPlanAction && !payload.date) {
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
  const claimed = await resolveChatAction(
    userId,
    id,
    confirm ? 'confirmed' : 'dismissed',
  );
  if (!claimed) {
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
    resultId = await createEntry(userId, action.kind, payload);
  } catch (error) {
    // Put it back so the user can try again or dismiss it.
    await reopenChatAction(id);
    if (error instanceof ExerciseGoalNotFoundError) {
      return NextResponse.json(
        {error: 'This exercise was changed or removed since. Ask the coach again.'},
        {status: 409},
      );
    }
    if (error instanceof AlreadyTickedError) {
      return NextResponse.json(
        {error: 'This exercise is already ticked off for that day.'},
        {status: 409},
      );
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({error: error.message}, {status: 409});
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
  await setChatActionResult(id, resultId).catch((error) => console.error('Failed to link chat action to entry:', error));
  return NextResponse.json({status: 'confirmed', resultId});
}
