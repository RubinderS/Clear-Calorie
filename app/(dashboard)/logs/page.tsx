import Link from 'next/link';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {cn} from '@/lib/utils';
import {FoodLog} from '@/components/food-log';
import {ExerciseLog} from '@/components/exercise-log';
import {WeightLog} from '@/components/weight-log';

const TABS = [
  {id: 'food', label: 'Food'},
  {id: 'exercise', label: 'Exercise'},
  {id: 'weight', label: 'Weight'},
] as const;

type Tab = (typeof TABS)[number]['id'];

function isTab(value: unknown): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{[key: string]: string | string[] | undefined}>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const {tab: tabParam} = await searchParams;
  const tab: Tab = isTab(tabParam) ? tabParam : 'food';
  const timeZone = await getUserTimeZone();
  const content = await renderTab(tab, userId, timeZone);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Logs</h1>
        <p className="text-muted-foreground">
          Your logged meals, workouts, and weights. Add new entries from the{' '}
          <Link href="/dashboard" className="underline underline-offset-4">
            Dashboard
          </Link>
        </p>
      </div>

      <nav
        aria-label="Log type"
        className="flex w-full rounded-lg bg-muted p-1 sm:inline-flex sm:w-auto"
      >
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={`/logs?tab=${item.id}`}
            aria-current={item.id === tab ? 'page' : undefined}
            className={cn(
              'flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none',
              item.id === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {content}
    </div>
  );
}

async function renderTab(tab: Tab, userId: string, timeZone: string) {
  if (tab === 'weight') {
    const entries = await prisma.weightLog.findMany({
      where: {userId},
      orderBy: {loggedAt: 'desc'},
      take: 30,
    });
    return <WeightLog entries={entries} timeZone={timeZone} />;
  }

  const {start: todayStart, end: todayEnd} = getTodayRange(timeZone);
  const where = {userId, loggedAt: {gte: todayStart, lte: todayEnd}};
  const orderBy = {loggedAt: 'desc'} as const;
  const today = format(toZoned(new Date(), timeZone), 'yyyy-MM-dd');

  if (tab === 'exercise') {
    const entries = await prisma.exerciseLog.findMany({where, orderBy});
    return <ExerciseLog entries={entries} timeZone={timeZone} today={today} />;
  }

  const entries = await prisma.foodLog.findMany({where, orderBy});
  return <FoodLog entries={entries} timeZone={timeZone} today={today} />;
}
