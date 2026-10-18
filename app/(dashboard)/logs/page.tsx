import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {isAiEnabled} from '@/lib/ai';
import {EXERCISE_LOG_INCLUDE} from '@/lib/exercise';
import {getTodaysPlanStatus} from '@/lib/exercise-plan';
import {prisma} from '@/lib/prisma';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {TogglerNav} from '@/components/ui/toggler';
import {FoodLog} from '@/components/food-log';
import {ExerciseLog} from '@/components/exercise-log';
import {WeightLog} from '@/components/weight-log';
import {BodyMetricLog} from '@/components/body-metric-log';
import {BodyMetricsManager} from '@/components/body-metrics-manager';
import {
  METRIC_ORDER,
  TRACKED_METRIC_SELECT,
  toTrackedMetric,
} from '@/lib/body-metrics';

const TABS = [
  {id: 'food', label: 'Food'},
  {id: 'exercise', label: 'Exercise'},
  {id: 'body', label: 'Body'},
] as const;

type Tab = (typeof TABS)[number]['id'];

function isTab(value: unknown): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

function tabHref(tab: Tab) {
  return `/logs?tab=${tab}`;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{[key: string]: string | string[] | undefined}>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const {tab: tabParam, manage} = await searchParams;
  // The Body tab was called Weight before it held other measurements.
  if (tabParam === 'weight') redirect('/logs?tab=body');
  const tab: Tab = isTab(tabParam) ? tabParam : 'food';
  const timeZone = await getUserTimeZone();
  const content = await renderTab(tab, userId, timeZone, manage === '1');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Logs</h1>
        <p className="text-muted-foreground">
          Your logged meals, workouts, weight and body measurements.
        </p>
      </div>

      <TogglerNav
        label="Log type"
        items={TABS.map((item) => ({
          href: tabHref(item.id),
          label: item.label,
        }))}
        current={tabHref(tab)}
        className="w-full sm:inline-grid sm:w-auto"
      />

      {content}
    </div>
  );
}

async function renderTab(
  tab: Tab,
  userId: string,
  timeZone: string,
  /** Open the body measurements dialog. */
  manage: boolean,
) {
  if (tab === 'body') {
    const [entries, metrics] = await Promise.all([
      prisma.weightLog.findMany({
        where: {userId},
        orderBy: {loggedAt: 'desc'},
        take: 30,
      }),
      prisma.bodyMetric.findMany({
        where: {userId},
        orderBy: [...METRIC_ORDER],
        select: {
          ...TRACKED_METRIC_SELECT,
          archivedAt: true,
          logs: {
            orderBy: {loggedAt: 'desc'},
            take: 30,
            select: {id: true, value: true, loggedAt: true},
          },
          _count: {select: {logs: true}},
        },
      }),
    ]);
    const active = metrics.filter((metric) => !metric.archivedAt);
    const archived = metrics
      .filter((metric) => metric.archivedAt)
      .map(({_count, ...metric}) => ({...metric, logCount: _count.logs}));
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          {/* Keyed so the body log dialog's manage link, which lands on
              this same page, still opens it. */}
          <BodyMetricsManager
            key={manage ? 'manage' : 'closed'}
            active={active.map(toTrackedMetric)}
            archived={archived.map((metric) => ({
              ...toTrackedMetric(metric),
              logCount: metric.logCount,
            }))}
            defaultOpen={manage}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <WeightLog
            entries={entries}
            timeZone={timeZone}
            bodyMetrics={active.map(toTrackedMetric)}
          />
          <BodyMetricLog metrics={active} timeZone={timeZone} />
        </div>
      </div>
    );
  }

  const {start: todayStart, end: todayEnd} = getTodayRange(timeZone);
  const where = {userId, loggedAt: {gte: todayStart, lte: todayEnd}};
  const orderBy = {loggedAt: 'desc'} as const;
  const today = format(toZoned(new Date(), timeZone), 'yyyy-MM-dd');

  if (tab === 'exercise') {
    const entries = await prisma.exerciseLog.findMany({
      where,
      orderBy,
      include: EXERCISE_LOG_INCLUDE,
    });
    const plannedExercises = await getTodaysPlanStatus(
      userId,
      timeZone,
      entries,
    );
    return (
      <ExerciseLog
        entries={entries}
        timeZone={timeZone}
        today={today}
        plannedExercises={plannedExercises}
      />
    );
  }

  const entries = await prisma.foodLog.findMany({where, orderBy});
  return (
    <FoodLog
      entries={entries}
      timeZone={timeZone}
      today={today}
      aiEnabled={isAiEnabled()}
    />
  );
}
