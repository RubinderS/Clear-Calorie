import {format, parseISO, subDays} from 'date-fns';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {getTodayDate, getUserTimeZone} from '@/lib/timezone';
import {loadProfileSummary} from '@/lib/profile';
import {ageFromBirthYear} from '@/lib/tdee';
import {ProfileForm} from '@/components/profile-form';
import {MaintenanceSummary} from '@/components/maintenance-summary';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const timeZone = await getUserTimeZone();
  const today = getTodayDate(timeZone);
  const yesterday = format(subDays(parseISO(today), 1), 'yyyy-MM-dd');

  const [profile, latestWeight, latestBodyFat, goal, summary] = await Promise.all([
    prisma.profile.findUnique({where: {userId}}),
    prisma.weightLog.findFirst({
      where: {userId},
      orderBy: {loggedAt: 'desc'},
      select: {weight: true},
    }),
    prisma.bodyMetricLog.findFirst({
      where: {metric: {userId, key: 'body_fat', unit: '%'}},
      orderBy: {loggedAt: 'desc'},
      select: {value: true},
    }),
    prisma.goal.findUnique({
      where: {userId},
      select: {calorieGoal: true, proteinGoal: true},
    }),
    // Today's food is still being logged, so the adaptive TDEE stops at
    // yesterday; weight is the latest weigh-in, today's included.
    loadProfileSummary(userId, timeZone, yesterday, new Date()),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Profile</h1>
        <p className="text-muted-foreground">
          Your details and goal, used for your maintenance calories and weekly
          report
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        {summary && (
          <MaintenanceSummary
            summary={summary}
            // Same defaults as the dashboard when there's no Goal row.
            foodGoal={{
              calories: goal?.calorieGoal ?? 2000,
              protein: goal?.proteinGoal ?? 150,
            }}
          />
        )}
        <ProfileForm
          className={summary ? undefined : 'md:col-span-2 md:max-w-xl'}
          defaults={{
            sex: profile?.sex ?? null,
            age: profile
              ? ageFromBirthYear(profile.birthYear, Number(today.slice(0, 4)))
              : null,
            heightCm: profile?.heightCm ?? null,
            weightKg: latestWeight?.weight ?? null,
            bodyFatPct: profile ? profile.bodyFatPct : null,
            loggedBodyFatPct: latestBodyFat?.value ?? null,
            activityLevel: profile?.activityLevel ?? null,
            goal: profile?.goal ?? null,
          }}
        />
      </div>
    </div>
  );
}
