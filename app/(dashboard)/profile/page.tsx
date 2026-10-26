import {format, parseISO, subDays} from 'date-fns';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {findLatestBodyFat} from '@/lib/data/body-metrics';
import {findGoals} from '@/lib/data/goals';
import {findProfile} from '@/lib/data/profiles';
import {findLatestWeightLog} from '@/lib/data/weight-logs';
import {isAiEnabled} from '@/lib/ai';
import {getTodayDate, getUserTimeZone} from '@/lib/timezone';
import {loadProfileSummary} from '@/lib/profile';
import {ageFromBirthYear} from '@/lib/tdee';
import {ProfileForm} from '@/components/profile-form';
import {MaintenanceSummary} from '@/components/maintenance-summary';
import {FoodGoalsForm} from '@/components/food-goals-form';
import {FoodPreferencesForm} from '@/components/food-preferences-form';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const timeZone = await getUserTimeZone();
  const today = getTodayDate(timeZone);
  const yesterday = format(subDays(parseISO(today), 1), 'yyyy-MM-dd');

  const [profile, latestWeight, latestBodyFat, goal, summary] = await Promise.all([
    findProfile(userId),
    findLatestWeightLog(userId),
    findLatestBodyFat(userId),
    findGoals(userId),
    // Today's food is still being logged, so the adaptive TDEE stops at
    // yesterday; weight is the latest weigh-in, today's included.
    loadProfileSummary(userId, timeZone, yesterday, new Date()),
  ]);

  const aiEnabled = isAiEnabled();
  const foodGoalsForm = <FoodGoalsForm goals={goal} aiEnabled={aiEnabled} />;
  const profileForm = (
    <ProfileForm
      defaults={{
        sex: profile?.sex ?? null,
        age: profile
          ? ageFromBirthYear(profile.birthYear, Number(today.slice(0, 4)))
          : null,
        heightCm: profile?.heightCm ?? null,
        weightKg: latestWeight?.weight ?? null,
        bodyFatPct: profile ? profile.bodyFatPct : null,
        loggedBodyFatPct: latestBodyFat,
        activityLevel: profile?.activityLevel ?? null,
        goal: profile?.goal ?? null,
      }}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Profile</h1>
        <p className="text-muted-foreground">
          Your details, maintenance calories and daily nutrition targets
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        {summary && (
          // The food goal sits under the summary that compares it with maintenance.
          <div className="space-y-6">
            <MaintenanceSummary
              summary={summary}
              // Same defaults as the dashboard when there's no Goal row.
              foodGoal={{
                calories: goal?.calorieGoal ?? 2000,
                protein: goal?.proteinGoal ?? 150,
              }}
            />
            {foodGoalsForm}
          </div>
        )}
        <div className="space-y-6">
          {profileForm}
          {/* Only the AI coach and weekly report use them. */}
          {aiEnabled && (
            <FoodPreferencesForm foodPreferences={goal?.foodPreferences ?? null} />
          )}
        </div>
        {!summary && foodGoalsForm}
      </div>
    </div>
  );
}
