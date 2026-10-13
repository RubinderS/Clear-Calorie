import {generateDueWeeklyReports} from '@/lib/weekly-report';

const FIRST_RUN_DELAY_MS = 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;

const globalForScheduler = globalThis as unknown as {
  weeklyReportScheduler?: NodeJS.Timeout;
};

let running = false;

async function runOnce() {
  // A slow AI service must not let hourly runs pile up.
  if (running) return;
  running = true;
  try {
    const {created, failed} = await generateDueWeeklyReports();
    if (created || failed) {
      console.log(`Weekly reports: ${created} created, ${failed} failed`);
    }
  } catch (error) {
    console.error('Weekly report run failed', error);
  } finally {
    running = false;
  }
}

/**
 * Checks hourly for users whose local week has ended. Hourly rather than once
 * a week because each user's Monday starts at a different time. Set
 * WEEKLY_REPORTS=off to disable, e.g. when an external cron runs the job.
 */
export function startWeeklyReportScheduler() {
  if (process.env.WEEKLY_REPORTS?.trim().toLowerCase() === 'off') return;
  // Dev reloads re-run instrumentation; keep a single timer.
  if (globalForScheduler.weeklyReportScheduler) return;

  setTimeout(runOnce, FIRST_RUN_DELAY_MS).unref();
  globalForScheduler.weeklyReportScheduler = setInterval(runOnce, INTERVAL_MS);
  globalForScheduler.weeklyReportScheduler.unref();
}
