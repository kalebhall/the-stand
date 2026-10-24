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

test('settings keeps personal preferences clear and ward configuration secondary', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings/);

  await expect(page.getByRole('heading', { name: 'Personal settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ward settings' })).toBeVisible();
  await expect(page.getByText('Beta add-ons', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Printed program layout' })).toBeVisible();
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
  const desktopMinistryToggle = desktopNavigation.getByRole('button', { name: 'People and Ministry' });
  await expect(desktopMinistryToggle).toHaveAttribute('aria-expanded', 'false');
  const desktopMinistryLinksId = await desktopMinistryToggle.getAttribute('aria-controls');
  expect(desktopMinistryLinksId).toBeTruthy();
  await expect(page.locator(`[id="${desktopMinistryLinksId}"]`)).toHaveAttribute('hidden', '');
  await desktopMinistryToggle.click();
  await expect(desktopMinistryToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`[id="${desktopMinistryLinksId}"]`)).toBeVisible();
  await desktopMinistryToggle.click();
  await expect(desktopMinistryToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`[id="${desktopMinistryLinksId}"]`)).toHaveAttribute('hidden', '');
  const membershipFollowupCard = page.locator('[data-dashboard-card="membership-follow-up"]').first();
  await expect(membershipFollowupCard).toBeVisible();

  await page.getByRole('button', { name: 'Edit dashboard' }).click();
  await expect(membershipFollowupCard).toBeVisible();
  await expect(page.getByRole('button', { name: /Move .* down/ }).first()).toBeVisible();
  await expect(page.getByText('Drag to reorder, or use the move buttons on touch screens.').first()).toBeVisible();

  await page
    .getByRole('button', { name: /Move .* down/ })
    .first()
    .click();
  await expect(page.getByText('Dashboard order saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Reset order' }).click();
  await expect(page.getByText('Dashboard order reset.')).toBeVisible();

  const savedOrderStatus = await page.evaluate(async (wardId) => {
    const response = await fetch(`/api/w/${wardId}/dashboard-preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cardOrder: ['draft-count', 'next-meeting'] })
    });
    return response.status;
  }, WARD_A);
  expect(savedOrderStatus).toBe(200);
  await page.reload();
  await expect.poll(() => page.locator('[data-dashboard-card]').nth(1).getAttribute('data-dashboard-card')).toBe('draft-count');
  await expect(page.locator('[data-dashboard-card]').first()).toHaveAttribute('data-dashboard-card', 'next-meeting');
  await expect(page.getByRole('region', { name: 'Next meeting' })).toBeVisible();
  const standLink = page.getByRole('link', { name: 'Stand', exact: true });
  await expect(standLink).toBeVisible();
  await expect(standLink).toHaveClass(/bg-primary/);
  await resetDashboardPreference(page);
  await page.reload();
  await page.getByRole('button', { name: 'Edit dashboard' }).click();

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
