import { expect, test, type Page } from '@playwright/test';

const WARD_A = '11111111-1111-4111-8111-111111111111';

async function login(page: Page) {
  await page.goto('/api/auth/signin?callbackUrl=/dashboard');
  await page.locator('input[name="email"]').fill('ward-admin@example.test');
  await page.locator('input[name="password"]').fill('WardAdminPassword123456789012');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 120_000 });
  await expect
    .poll(async () => Boolean((await (await page.request.get('/api/auth/session')).json())?.user), {
      timeout: 120_000
    })
    .toBe(true);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function resetDashboardPreference(page: Page) {
  await page.evaluate(async (wardId) => {
    await fetch(`/api/w/${wardId}/dashboard-preferences`, { method: 'DELETE' });
  }, WARD_A);
}

test('settings keeps personal preferences clear and tucks Beta add-ons away', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings/);

  await expect(page.getByRole('heading', { name: 'Personal settings' })).toBeVisible();
  const betaAddons = page.getByText('Beta add-ons', { exact: true }).locator('xpath=ancestor::details');
  await expect(betaAddons).toHaveJSProperty('open', false);
  await expect(page.getByText('Conducting Core')).toBeVisible();
  await betaAddons.locator('summary').click();
  await expect(
    betaAddons.getByText('Create and manage meeting programs, templates, and printable program layouts.', { exact: true })
  ).toBeVisible();
  await expect(betaAddons.getByText('Beta', { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('dashboard ordering remains usable at desktop and mobile widths', async ({ page }) => {
  await login(page);
  await resetDashboardPreference(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('button', { name: 'Edit dashboard' })).toBeVisible();

  const desktopNavigation = page.getByRole('navigation', { name: 'Desktop Navigation' });
  await expect(desktopNavigation.getByRole('button', { name: 'Workspace' })).toHaveAttribute('aria-expanded', 'true');
  await expect(desktopNavigation.getByRole('button', { name: 'People and Ministry' })).toHaveAttribute('aria-expanded', 'false');
  await desktopNavigation.getByRole('button', { name: 'People and Ministry' }).click();
  await expect(desktopNavigation.getByRole('button', { name: 'People and Ministry' })).toHaveAttribute('aria-expanded', 'true');
  await desktopNavigation.getByRole('button', { name: 'People and Ministry' }).click();
  await expect(desktopNavigation.getByRole('button', { name: 'People and Ministry' })).toHaveAttribute('aria-expanded', 'false');
  const moreWardWork = page.locator('main details').first();
  await expect(moreWardWork).toHaveJSProperty('open', false);

  await page.getByRole('button', { name: 'Edit dashboard' }).click();
  await expect(moreWardWork).toHaveJSProperty('open', true);
  await expect(page.getByRole('button', { name: /Move .* down/ }).first()).toBeVisible();
  await expect(page.getByText('Drag to reorder, or use the move buttons on touch screens.').first()).toBeVisible();

  await page
    .getByRole('button', { name: /Move .* down/ })
    .first()
    .click();
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
  await page
    .getByRole('button', { name: /Move .* down/ })
    .first()
    .click();
  await expect(page.getByText('Could not save dashboard order. Your change is kept on this screen; try again.')).toBeVisible();
  await page.unroute('**/api/w/*/dashboard-preferences');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile Navigation Links' });
  await expect(mobileNavigation.getByRole('button', { name: 'Workspace' })).toHaveAttribute('aria-expanded', 'true');
  await expect(mobileNavigation.getByRole('button', { name: 'People and Ministry' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('complementary', { name: 'Mobile Navigation' }).getByRole('button', { name: 'Close navigation menu' }).click();
  await page.getByRole('button', { name: 'Edit dashboard' }).click();
  await expect(page.getByRole('button', { name: /Move .* down/ }).first()).toBeVisible();
  await expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await resetDashboardPreference(page);
});
