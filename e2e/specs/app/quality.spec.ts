import AxeBuilder from '@axe-core/playwright';
import type {Page} from '@playwright/test';
import type {PrismaClient} from '@prisma/client';
import {test, expect} from '../../fixtures/test';
import {seedExercise, seedExerciseGoal, seedFood, seedWeight} from '../../fixtures/db';
import {todayIn} from '../../fixtures/dates';
import {dialog, openQuickLog} from '../../fixtures/ui';

const PUBLIC_PAGES = ['/', '/login', '/register', '/verify-email'];
const APP_PAGES = [
  '/dashboard',
  '/logs',
  '/logs?tab=exercise',
  '/logs?tab=weight',
  '/food-goal',
  '/exercise-plan',
];

/** Some of everything, so pages render their filled-in states. */
async function seedEverything({db, user}: {db: PrismaClient; user: {id: string}}) {
  const goal = await seedExerciseGoal(db, user.id, {name: 'Squats', notes: 'Chest up'});
  await seedExerciseGoal(db, user.id, {name: 'Run', type: 'TIME', durationMin: 20});
  await seedExercise(db, user.id, {name: 'Squats', exerciseGoalId: goal.id, goalDate: todayIn()});
  await seedFood(db, user.id, {name: 'Toast', calories: 200, protein: 8});
  await seedWeight(db, user.id);
}

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('Q-01 pages load without console errors', async ({authedPage: page, db, user}) => {
  await seedEverything({db, user});
  const errors = collectConsoleErrors(page);
  for (const path of APP_PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});

test('Q-01 public pages load without console errors', async ({page}) => {
  const errors = collectConsoleErrors(page);
  for (const path of ['/', '/login', '/register']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});

// Contrast is tracked separately in Q-02b so it doesn't mask other rules.
const KNOWN_FAILING_RULES = ['color-contrast'];

async function seriousViolations(
  page: Page,
  {include, rules}: {include?: string; rules?: string[]} = {},
) {
  const builder = new AxeBuilder({page});
  if (rules) builder.withRules(rules);
  else
    builder
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(KNOWN_FAILING_RULES);
  if (include) builder.include(include);
  const {violations} = await builder.analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

test.describe('Q-02 accessibility (axe, WCAG 2.1 AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`public pages, ${scheme}`, async ({page}) => {
      await page.emulateMedia({colorScheme: scheme});
      for (const path of PUBLIC_PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await seriousViolations(page), `${path} (${scheme})`).toEqual([]);
      }
    });

    test(`app pages, ${scheme}`, async ({authedPage: page, db, user}) => {
      await seedEverything({db, user});
      await page.emulateMedia({colorScheme: scheme});
      for (const path of APP_PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await seriousViolations(page), `${path} (${scheme})`).toEqual([]);
      }
    });
  }

  test('dialogs', async ({authedPage: page, db, user}) => {
    await seedEverything({db, user});
    await page.goto('/dashboard');
    for (const panel of ['food', 'exercise', 'weight'] as const) {
      await openQuickLog(page, panel);
      expect(await seriousViolations(page, {include: 'dialog[open]'}), panel).toEqual([]);
      await page.keyboard.press('Escape');
    }
    await page.goto('/exercise-plan');
    await page.getByRole('button', {name: 'Add exercise'}).click();
    expect(await seriousViolations(page, {include: 'dialog[open]'}), 'add goal').toEqual([]);
  });
});

test('Q-02b brand green meets WCAG AA contrast', async ({authedPage: page}) => {
  // FINDING: white text on the primary green is 3.33:1 in light mode and 2.3:1
  // in dark mode (AA needs 4.5:1); green link text is 3.3:1. Remove test.fail()
  // once the palette is fixed.
  test.fail();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme: scheme});
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(await seriousViolations(page, {rules: ['color-contrast']}), scheme).toEqual([]);
  }
});

test('Q-03 dialogs take focus and are labelled', async ({authedPage: page}) => {
  await page.goto('/dashboard');
  for (const panel of ['food', 'exercise', 'weight'] as const) {
    const panelDialog = await openQuickLog(page, panel);
    await expect(panelDialog).toBeFocused();
    await expect(panelDialog).toHaveAttribute('aria-label', `Log ${panel}`);
    await page.keyboard.press('Escape');
    await expect(dialog(page, `Log ${panel}`)).toBeHidden();
    // Focus returns to the page, so the trigger can be used again.
    await expect(page.getByRole('button', {name: `Log ${panel}`, exact: true})).toBeEnabled();
  }
});
