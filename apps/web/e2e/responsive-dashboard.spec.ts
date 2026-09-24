import { expect, test, type Page } from '@playwright/test';

const WARD_A = '11111111-1111-1111-1111-111111111111';

async function login(page: Page) {
  await page.goto('/api/auth/signin?callbackUrl=/dashboard');
  await page.locator('input[name="email"]').fill('ward-admin@example.test');
  await page.locator('input[name="password"]').fill('WardAdminPassword123456789012');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(async () => Boolean((await (await page.request.get('/api/auth/session')).json())?.user)).toBe(true);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function resetDashboardPreference(page: Page) {
  await page.evaluate(async (wardId) => {
    await fetch(`/api/w/${wardId}/dashboard-preferences`, { method: 'DELETE' });
  }, WARD_A);
}

test('dashboard ordering remains usable at desktop and mobile widths', async ({ page }) => {
  await login(page);
  await resetDashboardPreference(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('button', { name: 'Edit dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit dashboard' }).click();
  await expect(page.getByRole('button', { name: /Move .* down/ }).first()).toBeVisible();
  await expect(page.getByText('Drag to reorder, or use the move buttons on touch screens.').first()).toBeVisible();

  const firstCard = page.locator('[data-dashboard-card]').first();
  const secondCard = page.locator('[data-dashboard-card]').nth(1);
  await firstCard.dragTo(secondCard);
  await expect(page.getByText('Dashboard order saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Reset order' }).click();
  await expect(page.getByText('Dashboard order reset.')).toBeVisible();

  await page.route('**/api/w/*/dashboard-preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: /Move .* down/ }).first().click();
  await expect(page.getByText('Could not save dashboard order. Your change is kept on this screen; try again.')).toBeVisible();
  await page.unroute('**/api/w/*/dashboard-preferences');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit dashboard' }).click();
  await expect(page.getByRole('button', { name: /Move .* down/ }).first()).toBeVisible();
  await expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await resetDashboardPreference(page);
});
