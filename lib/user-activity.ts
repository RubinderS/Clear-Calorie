import {prisma} from '@/lib/prisma';

const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Saves the browser-detected timezone and last visit so server jobs can work
 * in the user's local time. Writes only when the timezone changed or the last
 * visit is over an hour old, so most page loads are a read only.
 */
export async function recordUserVisit(
  userId: string,
  detectedTimeZone: string | null,
) {
  const user = await prisma.user.findUnique({
    where: {id: userId},
    select: {timeZone: true, lastSeenAt: true},
  });
  if (!user) return;

  const now = new Date();
  const data: {timeZone?: string; lastSeenAt?: Date} = {};
  if (detectedTimeZone && detectedTimeZone !== user.timeZone) {
    data.timeZone = detectedTimeZone;
  }
  if (
    !user.lastSeenAt ||
    now.getTime() - user.lastSeenAt.getTime() >= LAST_SEEN_INTERVAL_MS
  ) {
    data.lastSeenAt = now;
  }
  if (Object.keys(data).length === 0) return;

  await prisma.user.update({where: {id: userId}, data});
}
