import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {authOptions} from '@/lib/auth-options';
import {isValidMetricValue, metricLogSchema} from '@/lib/body-metrics';
import {
  createBodyMetricLogs,
  deleteBodyMetricLog,
  findBodyMetrics,
} from '@/lib/data/body-metrics';

/** Logs values for one or more of the user's active metrics at once. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const parsed = metricLogSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }
    const {entries} = parsed.data;

    const metrics = await findBodyMetrics(
      session.user.id,
      entries.map((entry) => entry.metricId),
    );
    const byId = new Map(metrics.map((metric) => [metric.id, metric]));

    for (const entry of entries) {
      const metric = byId.get(entry.metricId);
      if (!metric) {
        return NextResponse.json({error: 'Metric not found'}, {status: 404});
      }
      // E.g. a form left open while the metric was archived elsewhere.
      if (metric.archivedAt) {
        return NextResponse.json(
          {error: 'This metric is archived'},
          {status: 409},
        );
      }
      if (!isValidMetricValue(metric, entry.value)) {
        return NextResponse.json({error: 'Invalid input'}, {status: 400});
      }
    }

    const logs = await createBodyMetricLogs(entries, new Date());
    return NextResponse.json(logs, {status: 201});
  } catch {
    return NextResponse.json(
      {error: 'Failed to log measurements'},
      {status: 500},
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const entryId = new URL(request.url).searchParams.get('id');
  if (!entryId) {
    return NextResponse.json({error: 'Entry ID is required'}, {status: 400});
  }

  if (!(await deleteBodyMetricLog(session.user.id, entryId))) {
    return NextResponse.json({error: 'Entry not found'}, {status: 404});
  }

  return new NextResponse(null, {status: 204});
}
