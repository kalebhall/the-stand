import { expect, test, type Page } from '@playwright/test';

const STAKE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function login(page: Page) {
  await page.goto('/api/auth/signin?callbackUrl=/dashboard');
  await page.locator('input[name="email"]').fill('ward-admin@example.test');
  await page.locator('input[name="password"]').fill('WardAdminPassword123456789012');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(async () => Boolean((await (await page.request.get('/api/auth/session')).json())?.user)).toBe(true);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function getStatus(page: Page, url: string) {
  return page.evaluate(async (requestUrl) => (await fetch(requestUrl)).status, url);
}

test('ward administrator can access the active ward template gallery', async ({ page }) => {
  await login(page);
  await page.goto('/programs/templates');
  await expect(page.getByRole('heading', { name: 'Template gallery' })).toBeVisible();
});

test('ward administrator cannot access system-template administration', async ({ page }) => {
  await login(page);
  expect(await getStatus(page, '/api/support/document-templates')).toBe(403);
});

test('ward administrator cannot access another stake template collection', async ({ page }) => {
  await login(page);
  expect(await getStatus(page, `/api/stakes/${STAKE_B}/document-templates`)).toBe(403);
});
