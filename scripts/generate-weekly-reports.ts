// Runs the weekly report job once, outside the server's hourly scheduler.
//
//   npm run reports:generate
//     Same as the scheduler: last week's report for every active user.
//
//   npm run reports:generate -- --email you@example.com --week 2026-10-05 [--timezone Australia/Sydney]
//     One user and week. --timezone overrides the user's saved timezone.
import {parseArgs} from 'node:util';
import {prisma} from '@/lib/prisma';
import {generateDueWeeklyReports, generateWeeklyReport} from '@/lib/weekly-report';
import {isAiEnabled} from '@/lib/ai';

async function main() {
  const {values} = parseArgs({
    options: {
      email: {type: 'string'},
      week: {type: 'string'},
      timezone: {type: 'string'},
    },
  });

  if (!isAiEnabled()) {
    throw new Error('AI is not configured: set AI_BASE_URL and AI_MODEL');
  }

  if (!values.email) {
    console.log(await generateDueWeeklyReports());
    return;
  }

  if (!values.week || !/^\d{4}-\d{2}-\d{2}$/.test(values.week)) {
    throw new Error('--week must be a Monday as yyyy-MM-dd');
  }
  if (new Date(`${values.week}T00:00:00Z`).getUTCDay() !== 1) {
    throw new Error(`${values.week} is not a Monday`);
  }

  const user = await prisma.user.findUnique({
    where: {email: values.email.trim().toLowerCase()},
    select: {id: true, timeZone: true},
  });
  if (!user) throw new Error(`No user with email ${values.email}`);

  const timeZone = values.timezone ?? user.timeZone;
  if (!timeZone) {
    throw new Error('User has no saved timezone yet; pass --timezone');
  }
  console.log(await generateWeeklyReport(user.id, timeZone, values.week));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
