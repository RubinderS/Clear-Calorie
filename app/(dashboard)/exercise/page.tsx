import Link from 'next/link';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {ExerciseLog} from '@/components/exercise-log';

export default async function ExercisePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const timeZone = await getUserTimeZone();
  const {start: todayStart, end: todayEnd} = getTodayRange(timeZone);

  const entries = await prisma.exerciseLog.findMany({
    where: {userId, loggedAt: {gte: todayStart, lte: todayEnd}},
    orderBy: {loggedAt: 'desc'},
  });

  const today = format(toZoned(new Date(), timeZone), 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exercise logs</h1>
        <p className="text-muted-foreground">
          Your logged workouts. Add new entries from the{' '}
          <Link href="/dashboard" className="underline underline-offset-4">
            Dashboard
          </Link>
          .
        </p>
      </div>

      <ExerciseLog entries={entries} timeZone={timeZone} today={today} />
    </div>
  );
}
