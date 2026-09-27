import { expect, test } from '@playwright/test';

test('Actions to Do priesthood follow-up appears and can be completed', async ({ page }) => {
  await page.goto('/api/auth/signin?callbackUrl=/dashboard');
  await page.locator('input[name="email"]').fill('ward-admin@example.test');
  await page.locator('input[name="password"]').fill('WardAdminPassword123456789012');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto('/actions-to-do');
  await expect(page.getByRole('heading', { name: 'Actions to Do' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'John Doe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open LCR' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const update = page.waitForResponse((response) => response.url().includes('/api/w/11111111-1111-4111-8111-111111111111/actions-to-do/') && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Mark completed' }).click();
  expect((await update).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'John Doe' })).not.toBeVisible();
});
