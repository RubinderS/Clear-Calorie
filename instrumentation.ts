export async function register() {
  // Background jobs need Node APIs and the database, so skip the Edge
  // runtime, and the build, which has no database to talk to.
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    // Build missing indexes before serving; a failure (e.g. duplicate data
    // under a new unique index) stops startup rather than serving without it.
    const [{connectDb}, {syncIndexes}] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/models'),
    ]);
    await connectDb();
    await syncIndexes();

    // The bundled food database; without it, estimates fall back to the AI.
    const {syncFoodDatabase} = await import('@/lib/food-dataset');
    await syncFoodDatabase().catch((error) =>
      console.error('Could not load the food database:', error),
    );

    const {startWeeklyReportScheduler} =
      await import('@/lib/weekly-report-scheduler');
    startWeeklyReportScheduler();
  }
}
