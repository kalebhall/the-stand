import { expect, test, type Page } from '@playwright/test';

const WARD_A = '11111111-1111-1111-1111-111111111111';
const WARD_B = '22222222-2222-2222-2222-222222222222';
const PUBLISHED_MEETING = '33333333-3333-3333-3333-333333333333';

async function login(page: Page, email: string, password: string) {
  await page.goto('/api/auth/signin?callbackUrl=/dashboard');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /sign in with credentials/i }).click();
}

test('bootstrap admin is forced to change password', async ({ page }) => {
  await login(page, 'support-admin@example.test', 'BootstrapPassword123456789012');
  await expect(page).toHaveURL(/\/account\/change-password/);

  await page.locator('input[name="currentPassword"]').fill('BootstrapPassword123456789012');
  await page.locator('input[name="newPassword"]').fill('BootstrapPassword123456789012_NEW');
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(page.getByText('Password changed successfully')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
});

test('ward isolation denies cross-ward API access', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  const response = await page.request.post(`/api/w/${WARD_B}/meetings`, {
    data: { meetingDate: '2026-02-01', meetingType: 'SACRAMENT' }
  });

  expect(response.status()).toBe(403);
});

test('meeting create publish and print flow works', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');

  const createResponse = await page.request.post(`/api/w/${WARD_A}/meetings`, {
    data: { meetingDate: '2026-02-08', meetingType: 'SACRAMENT' }
  });
  expect(createResponse.status()).toBe(201);
  const { id } = (await createResponse.json()) as { id: string };

  const updateResponse = await page.request.put(`/api/w/${WARD_A}/meetings/${id}`, {
    data: {
      meetingDate: '2026-02-08',
      meetingType: 'SACRAMENT',
      programItems: [{ itemType: 'WELCOME', title: 'Welcome', notes: 'Welcome everyone' }]
    }
  });
  expect(updateResponse.status()).toBe(200);

  const publishResponse = await page.request.post(`/api/w/${WARD_A}/meetings/${id}/publish`);
  expect(publishResponse.status()).toBe(200);

  await page.goto(`/meetings/${id}/print`);
  await expect(page.getByText('Print meeting program')).toBeVisible();
  await expect(page.getByText('SACRAMENT')).toBeVisible();
});

test('stand view renders formatted sustain/release text', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  await page.goto(`/stand/${PUBLISHED_MEETING}`);

  await expect(page.getByRole('heading', { name: 'At the Stand' })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'Jane Doe' })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'Primary President' })).toBeVisible();

  await page.goto(`/stand/${PUBLISHED_MEETING}?mode=compact`);
  await expect(page.getByText('Compact Labels')).toBeVisible();
});

test('public portal exposes published snapshot', async ({ page }) => {
  await page.goto('/p/meeting-token-e2e');
  await expect(page.getByText('Published snapshot')).toBeVisible();

  await page.goto('/p/ward/portal-token-e2e');
  await expect(page.getByText('Published snapshot')).toBeVisible();
});
