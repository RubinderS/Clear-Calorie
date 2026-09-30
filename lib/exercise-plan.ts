import {isActiveOn} from '@/lib/exercise';
import {prisma} from '@/lib/prisma';
import {getTodayWeekday} from '@/lib/timezone';

export async function getPlannedExerciseGoals(
  userId: string,
  timeZone: string,
) {
  const weekday = getTodayWeekday(timeZone);
  const goals = await prisma.exerciseGoal.findMany({
    where: {userId},
    orderBy: {createdAt: 'asc'},
  });
  return goals.filter((goal) => isActiveOn(goal.daysMask, weekday));
}
