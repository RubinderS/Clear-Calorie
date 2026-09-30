import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {format} from 'date-fns';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getTodayRange, getUserTimeZone, toZoned} from '@/lib/timezone';
import {FoodLog} from '@/components/food-log';
import {sumNumbers} from '@/lib/decimal';

export default async function FoodPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const timeZone = await getUserTimeZone();
  const {start: todayStart, end: todayEnd} = getTodayRange(timeZone);

  const entries = await prisma.foodLog.findMany({
    where: {userId, loggedAt: {gte: todayStart, lte: todayEnd}},
    orderBy: {loggedAt: 'desc'},
  });

  const totalCalories = sumNumbers(entries.map((entry) => entry.calories));
  const today = format(toZoned(new Date(), timeZone), 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Food log</h1>
        <p className="text-muted-foreground">Today: {totalCalories} calories</p>
      </div>

      <FoodLog entries={entries} timeZone={timeZone} today={today} />
    </div>
  );
}
