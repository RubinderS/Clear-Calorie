import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getUserTimeZone, toZoned} from '@/lib/timezone';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {WeightForm} from '@/components/weight-form';
import {WeightChart} from '@/components/weight-chart';

export default async function WeightPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const timeZone = await getUserTimeZone();
  const entries = await prisma.weightLog.findMany({
    where: {userId: session.user.id},
    orderBy: {loggedAt: 'desc'},
    take: 30,
  });

  const chartData = entries
    .slice()
    .reverse()
    .map((entry) => ({
      date: format(toZoned(entry.loggedAt, timeZone), 'MMM dd'),
      weight: entry.weight,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Weight log</h1>
        <p className="text-muted-foreground">Track your weight over time</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WeightForm />

        <Card>
          <CardHeader>
            <CardTitle>Recent entries</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No weight entries yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {entries.slice(0, 10).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
                        <span className="text-sm font-bold">W</span>
                      </div>
                      <p className="font-semibold">{entry.weight}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(
                        toZoned(entry.loggedAt, timeZone),
                        'MMM dd, yyyy',
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weight trend</CardTitle>
        </CardHeader>
        <CardContent>
          <WeightChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  );
}
