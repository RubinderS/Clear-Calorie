// Locators for recurring pieces of the UI, so specs read as behaviour.
import type {Locator, Page} from '@playwright/test';

/** A Card, found by its title (CardTitle renders an h3). */
export function card(scope: Page | Locator, title: string | RegExp) {
  const page = 'page' in scope ? scope.page() : scope;
  return scope
    .locator('div[class*="bg-card/80"]')
    .filter({has: page.getByRole('heading', {name: title, exact: true})});
}

/** A set for an exercise form: a number of reps, or a time like '0:45'. */
export type SetInput = number | string;

/** The Reps or Time option of a set row's type toggle. */
export function setMode(scope: Locator, set: number, mode: 'reps' | 'time') {
  return scope
    .getByRole('radiogroup', {name: `Set ${set} type`})
    .getByRole('radio', {name: mode === 'reps' ? 'Reps' : 'Time'});
}

/**
 * Fills an exercise form's set rows, adding or removing rows to match.
 * A weight, when given, goes on every set.
 */
export async function fillSets(
  scope: Locator,
  sets: readonly SetInput[],
  weight?: number,
) {
  const rows = scope.getByRole('button', {name: /^Remove set \d+$/});
  for (const [index, set] of sets.entries()) {
    if ((await rows.count()) <= index) {
      await scope.getByRole('button', {name: 'Add set'}).click();
    }
    const label = `Set ${index + 1}`;
    const mode = typeof set === 'number' ? 'reps' : 'time';
    await setMode(scope, index + 1, mode).check();
    await scope.getByLabel(`${label} ${mode}`).fill(String(set));
    if (weight !== undefined) {
      await scope.getByLabel(`${label} weight`).fill(String(weight));
    }
  }
  for (let count = await rows.count(); count > sets.length; count--) {
    await scope.getByRole('button', {name: `Remove set ${count}`}).click();
  }
}

/** The same reps or time, repeated for each set. */
export function repeat(set: SetInput, sets: number): SetInput[] {
  return Array.from({length: sets}, () => set);
}

export function dialog(page: Page, label: string) {
  return page.getByRole('dialog', {name: label});
}

export type QuickLogPanel = 'food' | 'exercise' | 'body';

/** Opens a dashboard quick-log dialog. The page must be on /dashboard. */
export async function openQuickLog(page: Page, panel: QuickLogPanel) {
  await page.getByRole('button', {name: `Log ${panel}`, exact: true}).click();
  const panelDialog = dialog(page, `Log ${panel}`);
  await panelDialog.waitFor();
  return panelDialog;
}

function summaryBlock(page: Page, label: string | RegExp) {
  return card(page, "Today's progress")
    .locator('div.flex-col.items-center.text-center')
    .filter({has: page.getByText(label, {exact: true})});
}

/** The calorie ring on "Today's progress". */
export function calorieSummary(page: Page) {
  const block = summaryBlock(page, 'Calories');
  return {
    remaining: block.locator('span.tabular-nums').first(),
    caption: block.locator('span.text-muted-foreground').first(),
    ratio: block.locator('p.text-xs'),
  };
}

/** A macro ring (Protein, Carbs or Fat) on "Today's progress". */
export function macroRing(page: Page, label: 'Protein' | 'Carbs' | 'Fat') {
  const block = card(page, "Today's progress")
    .locator('div.flex-col.items-center.text-center')
    .filter({has: page.locator('p.text-sm', {hasText: new RegExp(`^${label}`)})});
  return {
    remaining: block.locator('span.tabular-nums').first(),
    caption: block.locator('span.text-xs').first(),
    ratio: block.locator('p.text-xs'),
  };
}

/** The saturated fat limit bar on "Today's progress". */
export function limitBar(page: Page, label = 'Saturated fat') {
  const block = card(page, "Today's progress")
    .locator('div.space-y-1\\.5')
    .filter({has: page.getByText(label, {exact: true})});
  return {
    status: block.locator('span.font-semibold'),
    ratio: block.locator('p.text-xs'),
  };
}

export function exerciseProgress(page: Page) {
  return page.getByRole('progressbar', {name: 'Exercise plan completed'});
}

/** Rows of a Logs page list (food or exercise), filtered by entry name. */
export function logRow(page: Page, name: string) {
  return page
    .getByRole('listitem')
    .filter({has: page.getByText(name, {exact: true})});
}
