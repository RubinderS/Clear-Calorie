import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format, parseISO, subDays} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {MacrosChart} from '@/components/macros-chart';
import {macroColors} from '@/lib/chart-colors';
import {WeightChart} from '@/components/weight-chart';
import {NutritionProgress} from '@/components/nutrition-progress';
import {QuickLog} from '@/components/quick-log';
import {Decimal, sumNumbers} from '@/lib/decimal';
import {getPlannedExerciseGoals} from '@/lib/exercise-plan';
import {isAiEnabled} from '@/lib/ai';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const timeZone = await getUserTimeZone();
  const {start: todayStart, end: todayEnd} = getTodayRange(timeZone);

  const [
    goals,
    todaysFood,
    todaysExercise,
    recentWeights,
    weekFood,
    weekExercise,
    plannedGoals,
  ] = await Promise.all([
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
    prisma.exerciseLog.findMany({
      where: {userId, loggedAt: {gte: subDays(todayStart, 6), lte: todayEnd}},
      orderBy: {loggedAt: 'asc'},
    }),
    getPlannedExerciseGoals(userId, timeZone),
  ]);

  const todaysExerciseGoals = plannedGoals.map((goal) => ({
    ...goal,
    completed: todaysExercise.some((entry) => entry.exerciseGoalId === goal.id),
  }));

  const caloriesIn = sumNumbers(todaysFood.map((item) => item.calories));
  const protein = sumNumbers(todaysFood.map((item) => item.protein));
  const carbs = sumNumbers(todaysFood.map((item) => item.carbs));
  const fat = sumNumbers(todaysFood.map((item) => item.fat));
  const saturatedFat = sumNumbers(todaysFood.map((item) => item.saturatedFat));
  const caloriesOut = sumNumbers(todaysExercise.map((item) => item.calories));

  const calorieGoal = goals?.calorieGoal ?? 2000;
  const proteinGoal = goals?.proteinGoal ?? 150;
  const carbsGoal = goals?.carbsGoal ?? 250;
  const fatGoal = goals?.fatGoal ?? 70;
  const saturatedFatGoal = goals?.saturatedFatGoal ?? 20;

  const macroItems = [
    {
      label: 'Protein',
      value: protein,
      goal: proteinGoal,
      unit: 'g',
      colorClassName: 'text-purple-500',
    },
    {
      label: 'Carbs',
      value: carbs,
      goal: carbsGoal,
      unit: 'g',
      colorClassName: 'text-blue-500',
    },
    {
      label: 'Fat',
      value: fat,
      goal: fatGoal,
      unit: 'g',
      colorClassName: 'text-amber-500',
    },
  ];
  const limitItems = [
    {
      label: 'Saturated fat',
      value: saturatedFat,
      goal: saturatedFatGoal,
      unit: 'g',
      colorClassName: 'text-orange-700',
    },
  ];

  const weekMap = new Map<
    string,
    {calories: Decimal; protein: Decimal; exercise: Decimal}
  >();
  for (let i = 6; i >= 0; i--) {
    const date = format(subDays(todayStart, i), 'yyyy-MM-dd');
    weekMap.set(date, {
      calories: new Decimal(0),
      protein: new Decimal(0),
      exercise: new Decimal(0),
    });
  }
  for (const item of weekFood) {
    const date = format(toZoned(item.loggedAt, timeZone), 'yyyy-MM-dd');
    const totals = weekMap.get(date) ?? {
      calories: new Decimal(0),
      protein: new Decimal(0),
      exercise: new Decimal(0),
    };
    totals.calories = totals.calories.plus(item.calories);
    totals.protein = totals.protein.plus(item.protein);
    weekMap.set(date, totals);
  }
  for (const item of weekExercise) {
    const date = format(toZoned(item.loggedAt, timeZone), 'yyyy-MM-dd');
    const totals = weekMap.get(date) ?? {
      calories: new Decimal(0),
      protein: new Decimal(0),
      exercise: new Decimal(0),
    };
    totals.exercise = totals.exercise.plus(item.calories);
    weekMap.set(date, totals);
  }
  // parseISO keeps date-only keys at local midnight; new Date() would read them as UTC.
  const caloriesData = Array.from(weekMap.entries()).map(([date, totals]) => ({
    date: format(parseISO(date), 'MMM dd'),
    calories: totals.calories.minus(totals.exercise).toNumber(),
  }));
  const proteinData = Array.from(weekMap.entries()).map(([date, totals]) => ({
    date: format(parseISO(date), 'MMM dd'),
    protein: totals.protein.toNumber(),
  }));

  const weightData = recentWeights
    .slice()
    .reverse()
    .map((entry) => ({
      date: format(toZoned(entry.loggedAt, timeZone), 'MMM dd'),
      weight: entry.weight,
    }));

  return (
    <div className="space-y-6">
      <h1 className="hidden text-3xl font-bold md:block">Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s progress</CardTitle>
          <CardDescription>
            Calories, exercise, and macros vs. your daily goals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NutritionProgress
            calories={{
              eaten: caloriesIn,
              burned: caloriesOut,
              goal: calorieGoal,
            }}
            exercise={{
              done: todaysExerciseGoals.filter((goal) => goal.completed).length,
              total: todaysExerciseGoals.length,
            }}
            macros={macroItems}
            limits={limitItems}
          />
        </CardContent>
      </Card>

      <QuickLog
        aiEnabled={isAiEnabled()}
        plannedExercises={todaysExerciseGoals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          type: goal.type,
          calories: goal.calories,
          durationMin: goal.durationMin,
          sets: goal.sets,
          reps: goal.reps,
          weight: goal.weight,
          completed: goal.completed,
        }))}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calories this week</CardTitle>
            <CardDescription>
              Net calories (intake minus exercise) over the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MacrosChart
              data={caloriesData}
              dataKey="calories"
              goal={calorieGoal}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Protein this week</CardTitle>
            <CardDescription>
              Your daily protein intake over the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MacrosChart
              data={proteinData}
              dataKey="protein"
              color={macroColors.Protein}
              goal={proteinGoal}
            />
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
