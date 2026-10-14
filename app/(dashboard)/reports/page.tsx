import {format, parseISO} from 'date-fns';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {prisma} from '@/lib/prisma';
import {isAiEnabled} from '@/lib/ai';
import {getTodayDate, getUserTimeZone} from '@/lib/timezone';
import {getFocusProgress, toReportView} from '@/lib/weekly-report';
import {Card, CardContent} from '@/components/ui/card';
import {WeeklyReport, formatWeekRange} from '@/components/weekly-report';
import {ReportWeekPicker} from '@/components/report-week-picker';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{[key: string]: string | string[] | undefined}>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const {week} = await searchParams;
  const weeks = await prisma.weeklyReport.findMany({
    where: {userId},
    orderBy: {weekStart: 'desc'},
    select: {weekStart: true, weekEnd: true},
  });

  const selectedWeek =
    typeof week === 'string' && weeks.some((w) => w.weekStart === week)
      ? week
      : weeks[0]?.weekStart;
  const report = selectedWeek
    ? await prisma.weeklyReport.findUnique({
        where: {userId_weekStart: {userId, weekStart: selectedWeek}},
      })
    : null;
  if (report && !report.seenAt) {
    // Older reports count as seen too, so a skipped week can't keep the
    // dashboard notice up.
    await prisma.weeklyReport.updateMany({
      where: {userId, seenAt: null, weekStart: {lte: report.weekStart}},
      data: {seenAt: new Date()},
    });
  }

  const timeZone = await getUserTimeZone();
  const view = report ? toReportView(report) : null;
  const focusProgress = view
    ? await getFocusProgress(userId, view, timeZone, getTodayDate(timeZone))
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-3xl font-bold md:block">Reports</h1>
        <p className="text-muted-foreground">
          A weekly review of your food, exercise and weight
        </p>
      </div>

      {selectedWeek && weeks.length > 1 && (
        <ReportWeekPicker
          selected={selectedWeek}
          weeks={weeks.map((w) => ({
            weekStart: w.weekStart,
            // parseISO keeps date-only keys at local midnight.
            label: `${formatWeekRange(w.weekStart, w.weekEnd)}, ${format(parseISO(w.weekStart), 'yyyy')}`,
          }))}
        />
      )}

      {view ? (
        <WeeklyReport view={view} focusProgress={focusProgress} />
      ) : (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">No reports yet</p>
            <p className="text-sm text-muted-foreground">
              {isAiEnabled()
                ? 'Your first report is written automatically early on Monday, once you have logged food during the previous Monday to Sunday week.'
                : 'Weekly reports need the AI service to be configured (AI_BASE_URL and AI_MODEL).'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
