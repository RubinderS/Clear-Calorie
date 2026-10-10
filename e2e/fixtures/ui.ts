// Locators for recurring pieces of the UI, so specs read as behaviour.
import type {Locator, Page} from '@playwright/test';

/** A Card, found by its title (CardTitle renders an h3). */
export function card(scope: Page | Locator, title: string | RegExp) {
  const page = 'page' in scope ? scope.page() : scope;
  return scope
    .locator('div[class*="bg-card/80"]')
    .filter({has: page.getByRole('heading', {name: title, exact: true})});
}

export function dialog(page: Page, label: string) {
  return page.getByRole('dialog', {name: label});
}

export type QuickLogPanel = 'food' | 'exercise' | 'weight';

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

/** The calorie ring and eaten/burned stats on "Today's progress". */
export function calorieSummary(page: Page) {
  const block = summaryBlock(page, 'Calories');
  return {
    remaining: block.locator('span.tabular-nums').first(),
    caption: block.locator('span.text-muted-foreground').first(),
    ratio: block.locator('p.text-xs'),
    eaten: block.locator('[title="Eaten"] dd'),
    burned: block.locator('[title="Burned"] dd'),
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
