import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {ExerciseLog} from '@/components/exercise-log';
import {sumNumbers} from '@/lib/decimal';
import {getPlannedExerciseGoals} from '@/lib/exercise-plan';

export default async function ExercisePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const timeZone = await getUserTimeZone();
  const {start: todayStart, end: todayEnd} = getTodayRange(timeZone);

  const [entries, plannedGoals] = await Promise.all([
    prisma.exerciseLog.findMany({
      where: {userId, loggedAt: {gte: todayStart, lte: todayEnd}},
      orderBy: {loggedAt: 'desc'},
    }),
    getPlannedExerciseGoals(userId, timeZone),
  ]);

  const totalBurned = sumNumbers(entries.map((entry) => entry.calories));
  const today = format(toZoned(new Date(), timeZone), 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exercise log</h1>
        <p className="text-muted-foreground">
          Today: {totalBurned} calories burned
        </p>
      </div>

      <ExerciseLog
        entries={entries}
        plannedGoals={plannedGoals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          type: goal.type,
          calories: goal.calories,
          durationMin: goal.durationMin,
          sets: goal.sets,
          reps: goal.reps,
          weight: goal.weight,
        }))}
        timeZone={timeZone}
        today={today}
      />
    </div>
  );
}
