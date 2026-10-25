import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {authOptions} from '@/lib/auth-options';
import {upsertProfile} from '@/lib/data/profiles';
import {createWeightLog, findLatestWeightLog} from '@/lib/data/weight-logs';
import {getTodayDate, getUserTimeZone} from '@/lib/timezone';
import {birthYearForAge, profileSchema} from '@/lib/tdee';

/**
 * Saves the profile. Weight isn't stored on it: a weight that differs from the
 * latest weigh-in (or the first one) is logged as a new weigh-in.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  const userId = session.user.id;

  try {
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }
    const {age, weightKg, ...fields} = parsed.data;
    const currentYear = Number(getTodayDate(await getUserTimeZone()).slice(0, 4));
    const data = {...fields, birthYear: birthYearForAge(age, currentYear)};

    const latest = await findLatestWeightLog(userId);
    const profile = await upsertProfile(userId, data);
    if (latest?.weight !== weightKg) {
      await createWeightLog(userId, weightKg);
    }

    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({error: 'Failed to save profile'}, {status: 500});
  }
}
