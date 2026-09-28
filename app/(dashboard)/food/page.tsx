import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format, startOfDay, endOfDay} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {FoodForm} from '@/components/food-form';

export default async function FoodPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const entries = await prisma.foodLog.findMany({
    where: {userId, loggedAt: {gte: todayStart, lte: todayEnd}},
    orderBy: {loggedAt: 'desc'},
  });

  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Food log</h1>
        <p className="text-muted-foreground">Today: {totalCalories} calories</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FoodForm />

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s entries</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No food logged today.
              </p>
            ) : (
              <ul className="space-y-3">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <span className="text-sm font-bold">
                          {entry.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          P: {entry.protein}g · C: {entry.carbs}g · F:{' '}
                          {entry.fat}g · Sat: {entry.saturatedFat}g
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{entry.calories} kcal</p>
                      <p className="text-xs text-muted-foreground">
                        {format(entry.loggedAt, 'h:mm a')}
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
