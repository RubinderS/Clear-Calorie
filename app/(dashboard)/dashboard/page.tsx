import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format, startOfDay, endOfDay, subDays} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {MacrosChart} from '@/components/macros-chart';
import {WeightChart} from '@/components/weight-chart';
import {Activity, Flame, Scale, Target, Utensils} from 'lucide-react';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [goals, todaysFood, todaysExercise, recentWeights, weekFood] =
    await Promise.all([
      prisma.goal.findUnique({where: {userId}}),
      prisma.foodLog.findMany({
        where: {userId, loggedAt: {gte: todayStart, lte: todayEnd}},
        orderBy: {loggedAt: 'desc'},
      }),
      prisma.exerciseLog.findMany({
        where: {userId, loggedAt: {gte: todayStart, lte: todayEnd}},
        orderBy: {loggedAt: 'desc'},
      }),
      prisma.weightLog.findMany({
        where: {userId},
        orderBy: {loggedAt: 'desc'},
        take: 7,
      }),
      prisma.foodLog.findMany({
        where: {userId, loggedAt: {gte: subDays(todayStart, 6), lte: todayEnd}},
        orderBy: {loggedAt: 'asc'},
      }),
    ]);

  const caloriesIn = todaysFood.reduce((sum, item) => sum + item.calories, 0);
  const protein = todaysFood.reduce((sum, item) => sum + item.protein, 0);
  const carbs = todaysFood.reduce((sum, item) => sum + item.carbs, 0);
  const fat = todaysFood.reduce((sum, item) => sum + item.fat, 0);
  const caloriesOut = todaysExercise.reduce(
    (sum, item) => sum + item.calories,
    0,
  );

  const calorieGoal = goals?.calorieGoal ?? 2000;
  const remaining = calorieGoal - caloriesIn + caloriesOut;

  const proteinGoal = goals?.proteinGoal ?? 150;
  const proteinRemaining = proteinGoal - protein;

  const macrosData = [
    {name: 'Protein', value: protein, goal: goals?.proteinGoal ?? 150},
    {name: 'Carbs', value: carbs, goal: goals?.carbsGoal ?? 250},
    {name: 'Fat', value: fat, goal: goals?.fatGoal ?? 70},
  ];

  const weekMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const date = format(subDays(todayStart, i), 'yyyy-MM-dd');
    weekMap.set(date, 0);
  }
  for (const item of weekFood) {
    const date = format(item.loggedAt, 'yyyy-MM-dd');
    weekMap.set(date, (weekMap.get(date) ?? 0) + item.calories);
  }
  const caloriesData = Array.from(weekMap.entries()).map(
    ([date, calories]) => ({
      date: format(new Date(date), 'MMM dd'),
      calories,
    }),
  );

  const weightData = recentWeights
    .slice()
    .reverse()
    .map((entry) => ({
      date: format(entry.loggedAt, 'MMM dd'),
      weight: entry.weight,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Today&apos;s summary</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Calories in</CardDescription>
              <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                <Utensils className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-3xl">{caloriesIn}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Goal: {calorieGoal}</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Calories out</CardDescription>
              <div className="rounded-lg bg-orange-500/10 p-1.5 text-orange-500">
                <Flame className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-3xl">{caloriesOut}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">From exercise</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Remaining</CardDescription>
              <div className="rounded-lg bg-blue-500/10 p-1.5 text-blue-500">
                <Target className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-3xl">{remaining}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Net calories today</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Protein remaining</CardDescription>
              <div className="rounded-lg bg-purple-500/10 p-1.5 text-purple-500">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-3xl">{proteinRemaining}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Goal: {proteinGoal}g
            </p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Latest weight</CardDescription>
              <div className="rounded-lg bg-teal-500/10 p-1.5 text-teal-500">
                <Scale className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-3xl">
              {recentWeights[0]?.weight ?? '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {recentWeights[0]
                ? format(recentWeights[0].loggedAt, 'MMM dd')
                : 'No entries yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calories this week</CardTitle>
            <CardDescription>
              Your daily intake over the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MacrosChart data={caloriesData} dataKey="calories" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Macros today</CardTitle>
            <CardDescription>Protein, carbs, and fat breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <MacrosChart data={macrosData} dataKey="value" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weight trend</CardTitle>
          <CardDescription>Your recent weight changes</CardDescription>
        </CardHeader>
        <CardContent>
          <WeightChart data={weightData} />
        </CardContent>
      </Card>
    </div>
  );
}
