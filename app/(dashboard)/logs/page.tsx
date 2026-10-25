import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {isAiEnabled} from '@/lib/ai';
import {getTodaysPlanStatus} from '@/lib/exercise-plan';
import {countLogsByMetric, listBodyMetricsWithLogs} from '@/lib/data/body-metrics';
import {listExerciseLogs} from '@/lib/data/exercise-logs';
import {listFoodLogs} from '@/lib/data/food-logs';
import {listWeightLogs} from '@/lib/data/weight-logs';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {TogglerNav} from '@/components/ui/toggler';
import {FoodLog} from '@/components/food-log';
import {ExerciseLog} from '@/components/exercise-log';
import {WeightLog} from '@/components/weight-log';
import {BodyMetricLog} from '@/components/body-metric-log';
import {BodyMetricsManager} from '@/components/body-metrics-manager';
import {toTrackedMetric} from '@/lib/body-metrics';

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
    const [entries, withLogs] = await Promise.all([
      listWeightLogs(userId, {take: 30}),
      listBodyMetricsWithLogs(userId, {takeEach: 30}),
    ]);
    const metrics = withLogs.map(({logs, ...metric}) => ({
      ...toTrackedMetric(metric),
      archivedAt: metric.archivedAt,
      logs: logs.map(({id, value, loggedAt}) => ({id, value, loggedAt})),
    }));
    const active = metrics.filter((metric) => !metric.archivedAt);
    const archivedMetrics = metrics.filter((metric) => metric.archivedAt);
    const logCounts = await countLogsByMetric(
      archivedMetrics.map((metric) => metric.id),
    );
    const archived = archivedMetrics.map((metric) => ({
      ...metric,
      logCount: logCounts.get(metric.id) ?? 0,
    }));
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
        {/* Weight on its own takes the full width. */}
        <div
          className={`grid gap-6 ${active.length > 0 ? 'lg:grid-cols-2' : ''}`}
        >
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
  const loggedAt = {gte: todayStart, lte: todayEnd};
  const today = format(toZoned(new Date(), timeZone), 'yyyy-MM-dd');

  if (tab === 'exercise') {
    const entries = await listExerciseLogs(userId, {loggedAt});
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

  const entries = await listFoodLogs(userId, {loggedAt});
  return (
    <FoodLog
      entries={entries}
      timeZone={timeZone}
      today={today}
      aiEnabled={isAiEnabled()}
    />
  );
}
