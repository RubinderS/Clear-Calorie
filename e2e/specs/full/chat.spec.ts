import AxeBuilder from '@axe-core/playwright';
import type {Page} from '@playwright/test';
import {test, expect} from '../../fixtures/test';
import {seedFood} from '../../fixtures/db';
import {FOOD_ESTIMATE} from '../../mocks/data';

function coach(page: Page) {
  const panel = page.getByRole('dialog', {name: 'Coach'});
  return {
    panel,
    input: panel.getByRole('textbox', {name: 'Message the coach'}),
    send: panel.getByRole('button', {name: 'Send'}),
    reply: panel.getByTestId('chat-message-assistant'),
    close: panel.getByRole('button', {name: 'Close coach'}),
  };
}

async function ask(page: Page, message: string) {
  const {input} = coach(page);
  await input.fill(message);
  await input.press('Enter');
}

test.describe('desktop drawer', () => {
  test('CHAT-UI-01 answers in the drawer and stays open across pages', async ({
    authedPage: page,
    db,
    user,
  }) => {
    await seedFood(db, user.id, {protein: 30});
    await page.goto('/dashboard');
    await page.getByRole('button', {name: 'Ask coach'}).click();
    const c = coach(page);
    await expect(c.panel).toBeVisible();
    await expect(c.input).toBeFocused();
    await expect(c.panel.getByText('Ask your coach')).toBeVisible();

    await ask(page, '[ai:chat-tool] How was my protein?');
    await expect(c.reply).toHaveText('You logged food on 1 days, averaging 30 g protein.');
    await expect(c.reply.locator('strong')).toHaveText('30 g');

    // The drawer sits beside the page, so the nav still works.
    await page.getByRole('navigation').getByRole('link', {name: 'Logs'}).click();
    await expect(page).toHaveURL(/\/logs/);
    await expect(c.reply).toBeVisible();

    // The full page shows the same chat; the drawer and its button hide there.
    await c.panel.getByRole('link', {name: 'Open full page'}).click();
    await expect(page).toHaveURL(/\/chat\?thread=/);
    await expect(c.panel).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Ask coach'})).toHaveCount(0);
    await expect(page.getByTestId('chat-message-assistant')).toHaveText(/averaging 30 g/);
    await expect(
      page.getByRole('list', {name: 'Chats'}).getByRole('button', {name: /How was my protein/}).first(),
    ).toBeVisible();
  });

  test('CHAT-UI-02 a confirmed proposal shows on the dashboard', async ({
    authedPage: page,
    db,
    user,
  }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', {name: 'Ask coach'}).click();
    await ask(page, '[ai:chat-propose] Log my toast');

    const card = page.getByTestId('chat-action');
    await expect(card).toContainText(FOOD_ESTIMATE.name);
    await expect(card).toContainText(`${FOOD_ESTIMATE.calories} kcal`);
    await expect(card).toContainText(FOOD_ESTIMATE.assumptions);
    await expect(coach(page).reply).toHaveText(
      `I've proposed ${FOOD_ESTIMATE.name} for you to confirm.`,
    );
    expect(await db.foodLog.count({where: {userId: user.id}})).toBe(0);

    await card.getByRole('button', {name: 'Confirm'}).click();
    await expect(card.getByText('Logged')).toBeVisible();
    await expect(card.getByRole('button', {name: 'Confirm'})).toHaveCount(0);
    expect(await db.foodLog.count({where: {userId: user.id}})).toBe(1);
    // The page behind refreshes with the new entry.
    await expect(page.getByText(String(FOOD_ESTIMATE.calories)).first()).toBeVisible();
  });

  test('CHAT-UI-03 reopens the last chat and closes with Escape', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', {name: 'Ask coach'}).click();
    await ask(page, 'Hi there');
    await expect(coach(page).reply).toHaveText('Hello from the mock coach.');

    await page.reload();
    // The drawer was open, so it stays open with the same chat.
    await expect(coach(page).reply).toHaveText('Hello from the mock coach.');

    await coach(page).input.press('Escape');
    await expect(coach(page).panel).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', {name: 'Ask coach'})).toBeVisible();
    await expect(coach(page).panel).toHaveCount(0);
  });

  test('CHAT-UI-04 the drawer has no serious accessibility violations', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', {name: 'Ask coach'}).click();
    await ask(page, '[ai:chat-propose] Log my toast');
    await expect(page.getByTestId('chat-action')).toBeVisible();
    const {violations} = await new AxeBuilder({page})
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});

test.describe('mobile', () => {
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  test('CHAT-UI-05 the header icon opens a full-screen sheet that Back closes', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', {name: 'Ask coach'})).toBeHidden();
    await page.getByRole('button', {name: 'Open coach'}).click();

    const c = coach(page);
    await expect(c.panel).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\?coach=1$/);
    const box = await c.panel.boundingBox();
    expect(box).toMatchObject({x: 0, y: 0, width: 390});
    await expect(c.input).toBeInViewport();

    await ask(page, 'Hello');
    await expect(c.reply).toHaveText('Hello from the mock coach.');

    await page.goBack();
    await expect(c.panel).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);

    // The close button pops the same history entry.
    await page.getByRole('button', {name: 'Open coach'}).click();
    await expect(c.reply).toHaveText('Hello from the mock coach.');
    await c.close.click();
    await expect(c.panel).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('CHAT-UI-06 the chat page shows the list, then the conversation', async ({
    authedPage: page,
    api,
  }) => {
    await api.post('/api/chat', {data: {message: 'First question'}});
    await page.goto('/chat');
    await expect(page.getByRole('button', {name: 'Open coach'})).toHaveCount(0);

    const list = page.getByRole('list', {name: 'Chats'});
    const conversation = page.getByRole('region', {name: 'Conversation'});
    await expect(list).toBeVisible();
    await expect(conversation).toBeHidden();

    await list.getByRole('button', {name: /^First question/}).click();
    await expect(conversation).toBeVisible();
    await expect(list).toBeHidden();
    await expect(page.getByTestId('chat-message-assistant')).toHaveText(
      'Hello from the mock coach.',
    );
    await expect(page).toHaveURL(/\/chat\?thread=/);

    await page.getByRole('button', {name: 'All chats'}).click();
    await expect(list).toBeVisible();
  });
});
