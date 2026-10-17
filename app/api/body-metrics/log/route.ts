import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {authOptions} from '@/lib/auth-options';
import {isValidMetricValue, metricLogSchema} from '@/lib/body-metrics';
import {prisma} from '@/lib/prisma';

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

    const metrics = await prisma.bodyMetric.findMany({
      where: {
        id: {in: entries.map((entry) => entry.metricId)},
        userId: session.user.id,
      },
      select: {id: true, key: true, archivedAt: true},
    });
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

    const loggedAt = new Date();
    const logs = await prisma.$transaction(
      entries.map((entry) =>
        prisma.bodyMetricLog.create({
          data: {metricId: entry.metricId, value: entry.value, loggedAt},
        }),
      ),
    );
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

  const result = await prisma.bodyMetricLog.deleteMany({
    where: {id: entryId, metric: {userId: session.user.id}},
  });

  if (result.count === 0) {
    return NextResponse.json({error: 'Entry not found'}, {status: 404});
  }

  return new NextResponse(null, {status: 204});
}
