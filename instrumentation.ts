export async function register() {
  // Background jobs need Node APIs and Prisma, so skip the Edge runtime.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const {startWeeklyReportScheduler} =
      await import('@/lib/weekly-report-scheduler');
    startWeeklyReportScheduler();
  }
}
