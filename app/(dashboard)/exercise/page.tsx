import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {ExerciseForm} from '@/components/exercise-form';
import {Dumbbell} from 'lucide-react';

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

  const totalBurned = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const totalDuration = entries.reduce(
    (sum, entry) => sum + entry.durationMin,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exercise log</h1>
        <p className="text-muted-foreground">
          Today: {totalBurned} calories burned · {totalDuration} minutes
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExerciseForm />

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s workouts</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No exercise logged today.
              </p>
            ) : (
              <ul className="space-y-3">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                        <Dumbbell className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="font-medium">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.durationMin} minutes
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{entry.calories} kcal</p>
                      <p className="text-xs text-muted-foreground">
                        {format(toZoned(entry.loggedAt, timeZone), 'h:mm a')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
