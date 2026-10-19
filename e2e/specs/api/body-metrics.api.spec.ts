import {test, expect} from '../../fixtures/test';
import {seedBodyMetric, seedBodyMetricLog} from '../../fixtures/db';
import {MAX_ACTIVE_METRICS} from '../../../lib/body-metrics';

test.describe('Body metrics API', () => {
  test('BM-01 POST tracks a preset with the chosen unit', async ({api, user}) => {
    const response = await api.post('/api/body-metrics', {
      data: {key: 'waist', unit: 'in'},
    });
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      userId: user.id,
      key: 'waist',
      label: 'Waist',
      unit: 'in',
      direction: 'down',
      archivedAt: null,
    });

    const again = await api.post('/api/body-metrics', {data: {key: 'waist'}});
    expect(again.status()).toBe(409);
  });

  for (const [label, data] of [
    ['unknown preset', {key: 'shoe_size'}],
    ['unit the preset lacks', {key: 'waist', unit: 'kg'}],
    ['custom without direction', {label: 'Bicep', unit: 'cm'}],
    ['custom with empty label', {label: ' ', unit: 'cm', direction: 'up'}],
  ] as const) {
    test(`BM-02 ${label} → 400`, async ({api}) => {
      const response = await api.post('/api/body-metrics', {data});
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({error: 'Invalid input'});
    });
  }

  test('BM-03 custom names are unique and offer restoring an archived one', async ({
    api,
    db,
    user,
  }) => {
    const create = await api.post('/api/body-metrics', {
      data: {label: 'Bicep', unit: 'cm', direction: 'up'},
    });
    expect(create.status()).toBe(201);
    const {id} = await create.json();

    const duplicate = await api.post('/api/body-metrics', {
      data: {label: 'bicep', unit: 'in', direction: 'up'},
    });
    expect(duplicate.status()).toBe(409);
    expect(await duplicate.json()).not.toHaveProperty('archivedId');

    await db.bodyMetric.update({where: {id}, data: {archivedAt: new Date()}});
    const archived = await api.post('/api/body-metrics', {
      data: {label: 'BICEP', unit: 'cm', direction: 'up'},
    });
    expect(archived.status()).toBe(409);
    expect(await archived.json()).toMatchObject({archivedId: id});
    expect(await db.bodyMetric.count({where: {userId: user.id}})).toBe(1);
  });

  test('BM-04 archive and restore keep the history', async ({api, db, user}) => {
    const metric = await seedBodyMetric(db, user.id);
    await seedBodyMetricLog(db, metric.id);

    const archive = await api.patch(`/api/body-metrics?id=${metric.id}`, {
      data: {archived: true},
    });
    expect(archive.status()).toBe(200);
    expect((await archive.json()).archivedAt).not.toBeNull();

    const restore = await api.patch(`/api/body-metrics?id=${metric.id}`, {
      data: {archived: false},
    });
    expect(await restore.json()).toMatchObject({archivedAt: null});
    expect(await db.bodyMetricLog.count({where: {metricId: metric.id}})).toBe(1);

    const missing = await api.patch('/api/body-metrics', {data: {archived: true}});
    expect(missing.status()).toBe(400);
    const unknown = await api.patch('/api/body-metrics?id=nope', {
      data: {archived: true},
    });
    expect(unknown.status()).toBe(404);
  });

  test('BM-05 turning a preset back on restores the same row', async ({
    api,
    db,
    user,
  }) => {
    const used = await seedBodyMetric(db, user.id, {archivedAt: new Date()});
    await seedBodyMetricLog(db, used.id);
    const unused = await seedBodyMetric(db, user.id, {
      key: 'hips',
      label: 'Hips',
      archivedAt: new Date(),
    });

    // Switching a used metric's unit converts its history.
    const restored = await api.post('/api/body-metrics', {
      data: {key: 'waist', unit: 'in'},
    });
    expect(restored.status()).toBe(200);
    expect(await restored.json()).toMatchObject({
      id: used.id,
      unit: 'in',
      archivedAt: null,
    });
    const [log] = await db.bodyMetricLog.findMany({where: {metricId: used.id}});
    expect(log.value).toBe(33.46);

    const switched = await api.post('/api/body-metrics', {
      data: {key: 'hips', unit: 'in'},
    });
    expect(await switched.json()).toMatchObject({id: unused.id, unit: 'in'});
    expect(await db.bodyMetric.count({where: {userId: user.id}})).toBe(2);
  });

  test('BM-05b a used metric refuses a unit its history cannot convert to', async ({
    api,
    db,
    user,
  }) => {
    const metric = await seedBodyMetric(db, user.id, {
      key: 'muscle_mass',
      label: 'Muscle mass',
      unit: '%',
      archivedAt: new Date(),
    });
    await seedBodyMetricLog(db, metric.id, {value: 40});

    const response = await api.post('/api/body-metrics', {
      data: {key: 'muscle_mass', unit: 'kg'},
    });
    expect(response.status()).toBe(409);
    const unchanged = await db.bodyMetric.findUniqueOrThrow({where: {id: metric.id}});
    expect(unchanged).toMatchObject({unit: '%'});
    expect(unchanged.archivedAt).not.toBeNull();
  });

  test('BM-06 only archived metrics can be deleted, with their logs', async ({
    api,
    db,
    user,
  }) => {
    const metric = await seedBodyMetric(db, user.id);
    await seedBodyMetricLog(db, metric.id);

    const active = await api.delete(`/api/body-metrics?id=${metric.id}`);
    expect(active.status()).toBe(409);

    await db.bodyMetric.update({
      where: {id: metric.id},
      data: {archivedAt: new Date()},
    });
    expect((await api.delete(`/api/body-metrics?id=${metric.id}`)).status()).toBe(204);
    expect(await db.bodyMetric.count({where: {id: metric.id}})).toBe(0);
    expect(await db.bodyMetricLog.count({where: {metricId: metric.id}})).toBe(0);

    expect((await api.delete('/api/body-metrics')).status()).toBe(400);
    expect((await api.delete('/api/body-metrics?id=nope')).status()).toBe(404);
  });

  test('BM-07 active metrics are capped', async ({api, db, user}) => {
    await db.bodyMetric.createMany({
      data: Array.from({length: MAX_ACTIVE_METRICS}, (_, i) => ({
        userId: user.id,
        label: `Metric ${i}`,
        unit: 'cm',
      })),
    });
    const archived = await seedBodyMetric(db, user.id, {archivedAt: new Date()});

    const add = await api.post('/api/body-metrics', {data: {key: 'body_fat'}});
    expect(add.status()).toBe(400);
    const restore = await api.patch(`/api/body-metrics?id=${archived.id}`, {
      data: {archived: false},
    });
    expect(restore.status()).toBe(400);
  });

  test('BM-08 POST log saves several values at once', async ({api, db, user}) => {
    const waist = await seedBodyMetric(db, user.id);
    const fat = await seedBodyMetric(db, user.id, {
      key: 'body_fat',
      label: 'Body fat',
      unit: '%',
    });

    const response = await api.post('/api/body-metrics/log', {
      data: {
        entries: [
          {metricId: waist.id, value: 84.5},
          {metricId: fat.id, value: 22.1},
        ],
      },
    });
    expect(response.status()).toBe(201);
    const logs = await response.json();
    expect(logs).toHaveLength(2);
    expect(logs[0].loggedAt).toBe(logs[1].loggedAt);
    expect(
      await db.bodyMetricLog.findMany({
        where: {metric: {userId: user.id}},
        select: {value: true},
        orderBy: {value: 'asc'},
      }),
    ).toEqual([{value: 22.1}, {value: 84.5}]);
  });

  test('BM-09 POST log rejects bad values and archived metrics', async ({
    api,
    db,
    user,
  }) => {
    const fat = await seedBodyMetric(db, user.id, {
      key: 'body_fat',
      label: 'Body fat',
      unit: '%',
    });
    const archived = await seedBodyMetric(db, user.id, {archivedAt: new Date()});

    for (const entries of [
      [],
      [{metricId: fat.id, value: 90}],
      [{metricId: fat.id, value: '20'}],
      [
        {metricId: fat.id, value: 20},
        {metricId: fat.id, value: 21},
      ],
    ]) {
      const response = await api.post('/api/body-metrics/log', {data: {entries}});
      expect(response.status()).toBe(400);
    }

    const hidden = await api.post('/api/body-metrics/log', {
      data: {entries: [{metricId: archived.id, value: 80}]},
    });
    expect(hidden.status()).toBe(409);

    // One bad entry saves nothing.
    const mixed = await api.post('/api/body-metrics/log', {
      data: {
        entries: [
          {metricId: fat.id, value: 20},
          {metricId: 'nope', value: 80},
        ],
      },
    });
    expect(mixed.status()).toBe(404);
    expect(await db.bodyMetricLog.count({where: {metric: {userId: user.id}}})).toBe(0);
  });

  test('BM-10 DELETE log removes one entry', async ({api, db, user}) => {
    const metric = await seedBodyMetric(db, user.id);
    const log = await seedBodyMetricLog(db, metric.id);

    expect((await api.delete(`/api/body-metrics/log?id=${log.id}`)).status()).toBe(204);
    expect(await db.bodyMetricLog.count({where: {id: log.id}})).toBe(0);
    expect((await api.delete('/api/body-metrics/log')).status()).toBe(400);
    expect((await api.delete('/api/body-metrics/log?id=nope')).status()).toBe(404);
  });
});
