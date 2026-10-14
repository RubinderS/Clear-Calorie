import {test, expect} from '../../fixtures/test';
import {seedFood, seedWeeklyReport} from '../../fixtures/db';
import {noonDaysAgo, shiftDate, weekdayIn} from '../../fixtures/dates';
import {lastCompletedWeekStart} from '../../../lib/weekly-report-metrics';
import {format, parseISO} from 'date-fns';

test('RPT-01 empty state explains reports need AI', async ({authedPage: page}) => {
  await page.goto('/reports');
  await expect(page.getByText('No reports yet')).toBeVisible();
  await expect(page.getByText(/need the AI service to be configured/)).toBeVisible();
  // The app server runs without AI, so the nav link is hidden.
  await expect(page.getByRole('link', {name: 'Reports'})).toHaveCount(0);
});

test('RPT-02 shows the latest report, its focus follow-up and older weeks', async ({
  authedPage: page,
  user,
  db,
}) => {
  const lastWeek = lastCompletedWeekStart('UTC');
  const weekBefore = shiftDate(lastWeek, -7);
  await seedWeeklyReport(db, user.id, {
    weekStart: weekBefore,
    headline: 'First week headline',
  });
  await seedWeeklyReport(db, user.id, {
    weekStart: lastWeek,
    headline: 'Latest week headline',
    avgProtein: 131.5,
    sections: [{title: 'Training', points: ['Squats went up to 40 kg.']}],
    lastWeekFocusResults: [
      {
        id: 'avgProtein',
        text: 'Average 140 g protein',
        metric: 'avgProtein',
        target: 140,
        direction: 'min',
        baseline: 116,
        actual: 131.5,
        status: 'improved',
        streak: 2,
      },
      {
        id: 'weighInCount',
        text: 'Weigh in 3 times',
        metric: 'weighInCount',
        target: 3,
        direction: 'min',
        baseline: 1,
        actual: 3,
        status: 'met',
        streak: 1,
      },
    ],
    nextWeekFocus: [
      {
        id: 'foodMeals:paneer',
        text: 'Paneer at most once',
        metric: 'foodMeals',
        food: 'paneer',
        target: 1,
        direction: 'max',
        baseline: 4,
      },
    ],
  });
  // "So far" counts this week's completed days, so on a Monday there are none.
  const isMonday = weekdayIn() === 1;
  await seedFood(db, user.id, {name: 'Paneer tikka', loggedAt: new Date()});
  if (!isMonday) {
    await seedFood(db, user.id, {name: 'Paneer wrap', loggedAt: noonDaysAgo(1)});
  }

  await page.goto('/reports');
  await expect(page.getByText('Latest week headline')).toBeVisible();
  await expect(page.getByText('131.5 g', {exact: true})).toBeVisible();

  const followUp = page.locator('li').filter({hasText: 'Average 140 g protein'});
  await expect(followUp).toContainText('Improved');
  await expect(followUp).toContainText('131.5 g/day');
  await expect(page.locator('li').filter({hasText: 'Weigh in 3 times'})).toContainText('Met');

  // The written breakdown stays collapsed until asked for.
  await expect(page.getByText('Squats went up to 40 kg.')).toBeHidden();
  await page.getByText('Full breakdown').click();
  await expect(page.getByText('Squats went up to 40 kg.')).toBeVisible();

  // Today's paneer isn't counted until the day is over.
  const focus = page.locator('li').filter({hasText: 'Paneer at most once'});
  if (isMonday) {
    await expect(page.getByText(/So far this week/)).toHaveCount(0);
  } else {
    await expect(page.getByText(/So far this week \(Mon/)).toBeVisible();
    await expect(focus).toContainText('1 meal');
  }

  const weeks = page.getByRole('navigation', {name: 'Report weeks'});
  const picker = weeks.getByRole('combobox', {name: 'Report week'});
  await expect(picker).toHaveValue(lastWeek);
  await expect(picker.locator('option')).toHaveCount(2);
  await expect(weeks.getByLabel('Next week')).toHaveAttribute('aria-disabled', 'true');

  await weeks.getByRole('link', {name: 'Previous week'}).click();
  await expect(page).toHaveURL(`/reports?week=${weekBefore}`);
  await expect(page.getByText('First week headline')).toBeVisible();
  await expect(page.getByText("Last week's focus")).toHaveCount(0);
  await expect(weeks.getByLabel('Previous week')).toHaveAttribute('aria-disabled', 'true');

  await picker.selectOption(lastWeek);
  await expect(page).toHaveURL(`/reports?week=${lastWeek}`);
  await expect(page.getByText('Latest week headline')).toBeVisible();
});

test('RPT-03 another user’s report is never shown', async ({
  authedPage: page,
  makeUser,
  db,
}) => {
  const other = await makeUser();
  const weekStart = lastCompletedWeekStart('UTC');
  await seedWeeklyReport(db, other.id, {weekStart, headline: 'Private headline'});

  await page.goto(`/reports?week=${weekStart}`);
  await expect(page.getByText('No reports yet')).toBeVisible();
  await expect(page.getByText('Private headline')).toHaveCount(0);
});

test('RPT-05 dashboard announces unseen reports until one is opened', async ({
  authedPage: page,
  user,
  makeUser,
  db,
}) => {
  const lastWeek = lastCompletedWeekStart('UTC');
  const weekBefore = shiftDate(lastWeek, -7);
  const older = await seedWeeklyReport(db, user.id, {weekStart: weekBefore});
  const latest = await seedWeeklyReport(db, user.id, {weekStart: lastWeek});
  // Someone else's unseen report never shows up here.
  const other = await makeUser();
  await seedWeeklyReport(db, other.id, {weekStart: lastWeek});

  await page.goto('/dashboard');
  const notice = page.getByRole('region', {name: 'New weekly report'});
  await expect(notice).toContainText(
    `Your weekly report for ${format(parseISO(lastWeek), 'MMM d')} – ${format(parseISO(latest.weekEnd), 'MMM d')} is ready.`,
  );

  await notice.getByRole('link', {name: 'View report'}).click();
  await expect(page).toHaveURL('/reports');
  await expect(page.getByRole('combobox', {name: 'Report week'})).toHaveValue(lastWeek);

  // Opening the latest report covers the older unseen one too.
  for (const report of [latest, older]) {
    const {seenAt} = await db.weeklyReport.findUniqueOrThrow({where: {id: report.id}});
    expect(seenAt).not.toBeNull();
  }
  await page.goto('/dashboard');
  await expect(page.getByText("Today's progress")).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test.describe('RPT-04 visits save the timezone for the report job', () => {
  test.use({timezoneId: 'Europe/Berlin'});

  test('dashboard visit stores timezone and last seen', async ({authedPage: page, user, db}) => {
    const before = await db.user.findUniqueOrThrow({where: {id: user.id}});
    expect(before.timeZone).toBeNull();
    expect(before.lastSeenAt).toBeNull();

    await page.goto('/dashboard');
    await expect
      .poll(async () => (await db.user.findUniqueOrThrow({where: {id: user.id}})).timeZone)
      .toBe('Europe/Berlin');
    const after = await db.user.findUniqueOrThrow({where: {id: user.id}});
    expect(after.lastSeenAt).not.toBeNull();
  });
});
