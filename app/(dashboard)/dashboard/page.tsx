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
import {NutritionProgress} from '@/components/nutrition-progress';

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
  const netCalories = caloriesIn - caloriesOut;

  const proteinGoal = goals?.proteinGoal ?? 150;
  const carbsGoal = goals?.carbsGoal ?? 250;
  const fatGoal = goals?.fatGoal ?? 70;

  const progressItems = [
    {
      label: 'Calories',
      value: netCalories,
      goal: calorieGoal,
      unit: '',
      colorClassName: 'bg-primary',
    },
    {
      label: 'Protein',
      value: protein,
      goal: proteinGoal,
      unit: 'g',
      colorClassName: 'bg-purple-500',
    },
    {
      label: 'Carbs',
      value: carbs,
      goal: carbsGoal,
      unit: 'g',
      colorClassName: 'bg-blue-500',
    },
    {
      label: 'Fat',
      value: fat,
      goal: fatGoal,
      unit: 'g',
      colorClassName: 'bg-amber-500',
    },
  ];

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

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s progress</CardTitle>
          <CardDescription>
            Calories, protein, carbs, and fat vs. your daily goals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NutritionProgress items={progressItems} />
        </CardContent>
      </Card>

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
