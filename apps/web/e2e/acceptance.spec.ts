import { expect, test, type Page } from '@playwright/test';

const WARD_A = '11111111-1111-1111-1111-111111111111';
const WARD_B = '22222222-2222-2222-2222-222222222222';
const PUBLISHED_MEETING = '33333333-3333-3333-3333-333333333333';

async function login(page: Page, email: string, password: string) {
  await page.goto('/api/auth/signin?callbackUrl=/dashboard');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(dashboard|account\/change-password)/, { timeout: 30_000 });
  await expect.poll(async () => Boolean((await (await page.request.get('/api/auth/session')).json())?.user), {
    timeout: 30_000
  }).toBe(true);
}

async function apiRequest(page: Page, url: string, method: string, data?: unknown) {
  return page.evaluate(async ({ url: requestUrl, method: requestMethod, data: requestData }) => {
    const response = await fetch(requestUrl, {
      method: requestMethod,
      headers: requestData === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: requestData === undefined ? undefined : JSON.stringify(requestData)
    });
    return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
  }, { url, method, data });
}

test('bootstrap admin is forced to change password', async ({ page }) => {
  await login(page, 'support-admin@example.test', 'BootstrapPassword123456789012');
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();

  await page.locator('input[name="currentPassword"]').fill('BootstrapPassword123456789012');
  await page.locator('input[name="newPassword"]').fill('BootstrapPassword123456789012_NEW');
  await page.waitForLoadState('networkidle');
  const changeResponse = page.waitForResponse((response) => response.url().endsWith('/api/account/change-password') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Change password' }).click();
  expect((await changeResponse).status()).toBe(200);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
});

test('ward isolation denies cross-ward API access', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  const response = await apiRequest(page, `/api/w/${WARD_B}/meetings`, 'POST', { meetingDate: '2026-02-01', meetingType: 'SACRAMENT' });

  expect(response.status).toBe(403);
});

test('meeting create publish and print flow works', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');

  const createResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings`, 'POST', {
      meetingDate: '2026-02-08',
      meetingType: 'SACRAMENT',
      programItems: [
        { itemType: 'INTRODUCTION', title: 'Welcome' },
        { itemType: 'ANNOUNCEMENT', title: 'Announcements' }
      ]
  });
  expect(createResponse.status).toBe(201);
  const { id } = createResponse.body as { id: string };

  const updateResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${id}`, 'PUT', {
      meetingDate: '2026-02-08',
      meetingType: 'SACRAMENT',
      programItems: [
        { itemType: 'INTRODUCTION', title: 'Welcome' },
        { itemType: 'ANNOUNCEMENT', title: 'Announcements' },
        { itemType: 'WELCOME', title: 'Welcome', notes: 'Welcome everyone' }
      ]
  });
  expect(updateResponse.status).toBe(200);

  const layoutResponse = await apiRequest(page, `/api/w/${WARD_A}/public-layout`, 'PATCH', {
      preset: 'TRI_FOLD_BULLETIN',
      announcementMode: 'AFTER_PROGRAM',
      coverMode: 'NONE',
      coverImageUrl: '',
      coverImageAltText: ''
  });
  expect(layoutResponse.status).toBe(200);

  await page.goto(`/meetings/${id}/public-preview`);
  await expect(page).toHaveURL(new RegExp(`/meetings/${id}/public-preview$`));

  const publishResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${id}/publish`, 'POST');
  expect(publishResponse.status).toBe(200);

  await page.goto(`/meetings/${id}/print`);
  await expect(page.getByRole('main', { name: 'Sacrament meeting program' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /SACRAMENT/ }).first()).toBeVisible();
});

test('stand view renders formatted sustain/release text', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  await page.goto(`/stand/${PUBLISHED_MEETING}`);

  await expect(page.getByRole('heading', { name: 'At the Stand' })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'Jane Doe' })).toBeVisible();
  await expect(page.getByText('Primary President')).toBeVisible();

  await page.goto(`/stand/${PUBLISHED_MEETING}?mode=compact`);
  await expect(page.getByText('Compact Labels')).toBeVisible();
});

test('public portal exposes published snapshot', async ({ page }) => {
  await page.goto('/p/meeting-token-e2e');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.getByText('E2E Ward A')).toBeVisible();

  await page.goto('/p/ward/portal-token-e2e');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.getByText('E2E Ward A')).toBeVisible();
});
