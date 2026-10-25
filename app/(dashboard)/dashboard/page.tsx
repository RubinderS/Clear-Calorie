import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {FileText} from 'lucide-react';
import {format, parseISO, subDays} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {listBodyMetrics} from '@/lib/data/body-metrics';
import {listExerciseLogs} from '@/lib/data/exercise-logs';
import {listFoodLogs} from '@/lib/data/food-logs';
import {findGoals} from '@/lib/data/goals';
import {listWeightLogs} from '@/lib/data/weight-logs';
import {findLatestUnseenReportWeek} from '@/lib/data/weekly-reports';
import {
  getTodayDate,
  getTodayRange,
  getUserTimeZone,
  toZoned,
} from '@/lib/timezone';
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
import {RollingAverage} from '@/components/rolling-average';
import {
  ExerciseChart,
  type ExerciseChartDatum,
} from '@/components/exercise-chart';
import {NutritionProgress} from '@/components/nutrition-progress';
import {QuickLog} from '@/components/quick-log';
import {Button} from '@/components/ui/button';
import {formatWeekRange} from '@/components/weekly-report';
import {Decimal, sumNumbers} from '@/lib/decimal';
import {getPlannedCounts, getTodaysPlanStatus} from '@/lib/exercise-plan';
import {isAiEnabled} from '@/lib/ai';
import {
  ROLLING_AVERAGE_DAYS,
  rollingAverages,
  toTrackedMetric,
} from '@/lib/body-metrics';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const timeZone = await getUserTimeZone();
  const {start: todayStart, end: todayEnd} = getTodayRange(timeZone);
  const today = getTodayDate(timeZone);
  const weekDates = Array.from({length: 7}, (_, i) =>
    format(subDays(todayStart, 6 - i), 'yyyy-MM-dd'),
  );

  const [
    goals,
    todaysFood,
    todaysExercise,
    recentWeights,
    averageWeights,
    weekFood,
    weekExercise,
    weekPlannedCounts,
    unseenReport,
    bodyMetrics,
  ] = await Promise.all([
    findGoals(userId),
    listFoodLogs(userId, {loggedAt: {gte: todayStart, lte: todayEnd}}),
    listExerciseLogs(userId, {loggedAt: {gte: todayStart, lte: todayEnd}}),
    listWeightLogs(userId, {take: 7}),
    // Two weeks for the 7-day average and its change.
    listWeightLogs(userId, {
      loggedAt: {gte: subDays(todayStart, 2 * ROLLING_AVERAGE_DAYS - 1)},
    }),
    listFoodLogs(userId, {
      loggedAt: {gte: subDays(todayStart, 6), lte: todayEnd},
      order: 'asc',
    }),
    listExerciseLogs(userId, {
      loggedAt: {gte: subDays(todayStart, 6), lte: todayEnd},
      order: 'asc',
    }),
    getPlannedCounts(userId, weekDates, timeZone),
    findLatestUnseenReportWeek(userId),
    listBodyMetrics(userId, {activeOnly: true}).then((metrics) =>
      metrics.map(toTrackedMetric),
    ),
  ]);

  const todaysExerciseGoals = await getTodaysPlanStatus(
    userId,
    timeZone,
    todaysExercise,
  );

  const caloriesIn = sumNumbers(todaysFood.map((item) => item.calories));
  const protein = sumNumbers(todaysFood.map((item) => item.protein));
  const carbs = sumNumbers(todaysFood.map((item) => item.carbs));
  const fat = sumNumbers(todaysFood.map((item) => item.fat));
  const saturatedFat = sumNumbers(todaysFood.map((item) => item.saturatedFat));

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

  const weekMap = new Map<string, {calories: Decimal; protein: Decimal}>();
  for (const date of weekDates) {
    weekMap.set(date, {calories: new Decimal(0), protein: new Decimal(0)});
  }
  for (const item of weekFood) {
    const date = format(toZoned(item.loggedAt, timeZone), 'yyyy-MM-dd');
    const totals = weekMap.get(date) ?? {
      calories: new Decimal(0),
      protein: new Decimal(0),
    };
    totals.calories = totals.calories.plus(item.calories);
    totals.protein = totals.protein.plus(item.protein);
    weekMap.set(date, totals);
  }
  // parseISO keeps date-only keys at local midnight; new Date() would read them as UTC.
  const caloriesData = Array.from(weekMap.entries()).map(([date, totals]) => ({
    date: format(parseISO(date), 'MMM dd'),
    calories: totals.calories.toNumber(),
  }));
  const proteinData = Array.from(weekMap.entries()).map(([date, totals]) => ({
    date: format(parseISO(date), 'MMM dd'),
    protein: totals.protein.toNumber(),
  }));

  // Ticked planned exercises keep goalDate even if the goal is later deleted.
  const exerciseCounts = new Map(
    weekDates.map((date) => [date, {done: 0, extra: 0}]),
  );
  for (const item of weekExercise) {
    const date = format(toZoned(item.loggedAt, timeZone), 'yyyy-MM-dd');
    const counts = exerciseCounts.get(date);
    if (!counts) continue;
    if (item.goalDate) counts.done++;
    else counts.extra++;
  }
  const exerciseData: ExerciseChartDatum[] = weekDates.map((date) => {
    const {done, extra} = exerciseCounts.get(date)!;
    const planned = weekPlannedCounts.get(date) ?? 0;
    return {
      date: format(parseISO(date), 'MMM dd'),
      done,
      missed: Math.max(planned - done, 0),
      extra,
      isToday: date === today,
    };
  });

  const weightAverage = rollingAverages(
    averageWeights.map(({weight, loggedAt}) => ({value: weight, loggedAt})),
    todayStart,
  );

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

      {unseenReport && (
        <Card role="region" aria-label="New weekly report">
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              Your weekly report for{' '}
              {formatWeekRange(unseenReport.weekStart, unseenReport.weekEnd)}{' '}
              is ready.
            </p>
            <Button asChild size="sm">
              <Link href="/reports">View report</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s progress</CardTitle>
        </CardHeader>
        <CardContent>
          <NutritionProgress
            calories={{
              eaten: caloriesIn,
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
        bodyMetrics={bodyMetrics}
        plannedExercises={todaysExerciseGoals}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calories this week</CardTitle>
            <CardDescription>
              Your daily calorie intake over the last 7 days
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
          <CardTitle>Exercise this week</CardTitle>
          <CardDescription>
            Planned exercises done and missed, plus extras, over the last 7 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExerciseChart data={exerciseData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Weight trend{' '}
            <span className="text-base font-normal text-muted-foreground">
              (kg)
            </span>
          </CardTitle>
          <CardDescription>
            {weightAverage.avg === null ? (
              'Your recent weight changes'
            ) : (
              <RollingAverage
                avg={weightAverage.avg}
                prevAvg={weightAverage.prevAvg}
                unit="kg"
                decimals={1}
              />
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeightChart data={weightData} />
        </CardContent>
      </Card>
    </div>
  );
}
