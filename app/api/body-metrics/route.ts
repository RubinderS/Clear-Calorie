import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth/next';
import {z} from 'zod';
import {authOptions} from '@/lib/auth-options';
import {
  canConvertUnit,
  convertUnitValue,
  MAX_ACTIVE_METRICS,
  parseMetricDefinition,
} from '@/lib/body-metrics';
import {prisma} from '@/lib/prisma';

const archiveSchema = z.object({archived: z.boolean()});

const LIMIT_ERROR = `You can track up to ${MAX_ACTIVE_METRICS} metrics. Archive one first.`;

function countActive(userId: string) {
  return prisma.bodyMetric.count({where: {userId, archivedAt: null}});
}

/**
 * Starts tracking a preset or custom metric. Turning a preset back on restores
 * the archived one, history included.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  const userId = session.user.id;

  try {
    const definition = parseMetricDefinition(await request.json());
    if (!definition) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const [metrics, active] = await Promise.all([
      prisma.bodyMetric.findMany({
        where: {userId},
        select: {
          id: true,
          key: true,
          label: true,
          unit: true,
          decimals: true,
          archivedAt: true,
          sortOrder: true,
          _count: {select: {logs: true}},
        },
      }),
      countActive(userId),
    ]);

    const existing = definition.key
      ? metrics.find((metric) => metric.key === definition.key)
      : metrics.find(
          (metric) =>
            metric.key === null &&
            metric.label.toLowerCase() === definition.label.toLowerCase(),
        );

    if (existing && !definition.key) {
      return NextResponse.json(
        existing.archivedAt
          ? {error: 'An archived metric has this name', archivedId: existing.id}
          : {error: 'You already track a metric with this name'},
        {status: 409},
      );
    }
    if (existing && !existing.archivedAt) {
      return NextResponse.json(
        {error: 'You already track this metric'},
        {status: 409},
      );
    }
    if (active >= MAX_ACTIVE_METRICS) {
      return NextResponse.json({error: LIMIT_ERROR}, {status: 400});
    }

    if (existing) {
      // Logged values are in the old unit, so switching converts them.
      const convert = existing._count.logs > 0 && existing.unit !== definition.unit;
      if (convert && !canConvertUnit(existing.unit, definition.unit)) {
        return NextResponse.json(
          {
            error: `Your ${existing.label.toLowerCase()} history is in ${existing.unit}, which can't be converted to ${definition.unit}. Add it in ${existing.unit}, or delete the archived one to start fresh.`,
          },
          {status: 409},
        );
      }

      const metric = await prisma.$transaction(async (tx) => {
        if (convert) {
          const logs = await tx.bodyMetricLog.findMany({
            where: {metricId: existing.id},
            select: {id: true, value: true},
          });
          for (const log of logs) {
            await tx.bodyMetricLog.update({
              where: {id: log.id},
              // One extra decimal so converting back and forth doesn't drift.
              data: {
                value: convertUnitValue(
                  log.value,
                  existing.unit,
                  definition.unit,
                  existing.decimals + 1,
                ),
              },
            });
          }
        }
        return tx.bodyMetric.update({
          where: {id: existing.id},
          data: {archivedAt: null, unit: definition.unit},
        });
      });
      return NextResponse.json(metric);
    }

    const sortOrder =
      Math.max(-1, ...metrics.map((metric) => metric.sortOrder)) + 1;
    const metric = await prisma.bodyMetric.create({
      data: {...definition, userId, sortOrder},
    });
    return NextResponse.json(metric, {status: 201});
  } catch {
    return NextResponse.json(
      {error: 'Failed to add metric'},
      {status: 500},
    );
  }
}

/** Archives (hides, keeping history) or restores a metric. */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  const userId = session.user.id;

  const metricId = new URL(request.url).searchParams.get('id');
  if (!metricId) {
    return NextResponse.json({error: 'Metric ID is required'}, {status: 400});
  }

  try {
    const parsed = archiveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({error: 'Invalid input'}, {status: 400});
    }

    const metric = await prisma.bodyMetric.findFirst({
      where: {id: metricId, userId},
    });
    if (!metric) {
      return NextResponse.json({error: 'Metric not found'}, {status: 404});
    }

    const {archived} = parsed.data;
    if (archived === (metric.archivedAt !== null)) {
      return NextResponse.json(metric);
    }
    if (!archived && (await countActive(userId)) >= MAX_ACTIVE_METRICS) {
      return NextResponse.json({error: LIMIT_ERROR}, {status: 400});
    }

    const updated = await prisma.bodyMetric.update({
      where: {id: metric.id},
      data: {archivedAt: archived ? new Date() : null},
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      {error: 'Failed to update metric'},
      {status: 500},
    );
  }
}

/** Permanently deletes an archived metric and all its logs. */
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const metricId = new URL(request.url).searchParams.get('id');
  if (!metricId) {
    return NextResponse.json({error: 'Metric ID is required'}, {status: 400});
  }

  const metric = await prisma.bodyMetric.findFirst({
    where: {id: metricId, userId: session.user.id},
    select: {id: true, archivedAt: true},
  });
  if (!metric) {
    return NextResponse.json({error: 'Metric not found'}, {status: 404});
  }
  // Deleting is only offered from the archived list, so history isn't lost by accident.
  if (!metric.archivedAt) {
    return NextResponse.json(
      {error: 'Archive the metric before deleting it'},
      {status: 409},
    );
  }

  await prisma.bodyMetric.delete({where: {id: metric.id}});
  return new NextResponse(null, {status: 204});
}
