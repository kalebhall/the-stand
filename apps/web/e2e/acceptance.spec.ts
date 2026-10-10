import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test, type Page } from '@playwright/test';

const WARD_A = '11111111-1111-4111-8111-111111111111';
const WARD_B = '22222222-2222-4222-8222-222222222222';
const PUBLISHED_MEETING = '33333333-3333-4333-8333-333333333333';
const execFileAsync = promisify(execFile);

async function login(page: Page, email: string, password: string) {
  await page.goto('/api/auth/signin?callbackUrl=/dashboard');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(dashboard|account\/change-password)/, { timeout: 120_000 });
  await expect
    .poll(async () => Boolean((await (await page.request.get('/api/auth/session')).json())?.user), {
      timeout: 120_000
    })
    .toBe(true);
}

async function apiRequest(page: Page, url: string, method: string, data?: unknown) {
  return page.evaluate(
    async ({ url: requestUrl, method: requestMethod, data: requestData }) => {
      const response = await fetch(requestUrl, {
        method: requestMethod,
        headers: requestData === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: requestData === undefined ? undefined : JSON.stringify(requestData)
      });
      return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
    },
    { url, method, data }
  );
}

async function cleanupPublishedMeeting(meetingId: string): Promise<void> {
  const result = await execFileAsync('node', ['scripts/e2e-cleanup.mjs', meetingId], {
    cwd: process.cwd(),
    env: { ...process.env, E2E_FIXTURES_ALLOWED: '1' }
  });
  expect(result.stdout).toContain(`cleaned E2E meeting ${meetingId}`);
}

test('bootstrap admin is forced to change password', async ({ page }) => {
  await login(page, 'support-admin@example.test', 'BootstrapPassword123456789012');
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible({ timeout: 120_000 });

  await page.locator('input[name="currentPassword"]').fill('BootstrapPassword123456789012');
  await page.locator('input[name="newPassword"]').fill('BootstrapPassword123456789012_NEW');
  await page.waitForLoadState('networkidle');
  const changeResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/account/change-password') && response.request().method() === 'POST'
  );
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
  let createdMeetingId: string | null = null;
  try {
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
    createdMeetingId = id;
    const sourceResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${id}/program-items`, 'GET');
    expect(sourceResponse.status).toBe(200);
    const sourceItems = sourceResponse.body as { sourceRevision: string; items: Array<Record<string, unknown>> };
    const expectedProgramItemsRevision = sourceItems.sourceRevision;

    const updateResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${id}`, 'PUT', {
      meetingDate: '2026-02-08',
      meetingType: 'SACRAMENT',
      expectedProgramItemsRevision,
      programItems: [
        { ...sourceItems.items[0], title: 'Welcome' },
        { ...sourceItems.items[1], title: 'Announcements' },
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
  } finally {
    if (createdMeetingId) {
      await cleanupPublishedMeeting(createdMeetingId);
    }
  }
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

test('uniform content editor works without Advanced Layout and persists source rows', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  let meetingId: string | null = null;
  try {
    const createResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings`, 'POST', {
      meetingDate: '2026-12-20',
      meetingType: 'SACRAMENT',
      programItems: [
        { itemType: 'INTRODUCTION', title: 'Introduction' },
        { itemType: 'ANNOUNCEMENT', title: 'Announcements' },
        { itemType: 'SPEAKER', title: 'Jane Doe', topic: 'Faith in Jesus Christ' }
      ]
    });
    expect(createResponse.status).toBe(201);
    meetingId = (createResponse.body as { id: string }).id;

    const designResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${meetingId}/program-design`, 'GET');
    if (designResponse.status !== 200) throw new Error(`program design load failed: ${JSON.stringify(designResponse)}`);
    const itemsResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${meetingId}/program-items`, 'GET');
    if (itemsResponse.status !== 200) throw new Error(`program items load failed: ${JSON.stringify(itemsResponse)}`);
    await page.goto(`/programs/${meetingId}`);
    await expect(page.getByRole('button', { name: 'Content' })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Advanced Mode' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Meeting program' })).toHaveCSS('white-space', 'nowrap');
    await page.getByRole('button', { name: 'Content' }).click();
    await expect(page.getByRole('heading', { name: 'Program content' })).toBeVisible({ timeout: 120_000 });

    const introduction = page.getByRole('article', { name: '1. Introduction' });
    await expect(introduction.getByLabel('Presiding')).toBeVisible();
    await expect(introduction.getByLabel('Conducting')).toBeVisible();
    await expect(page.getByRole('article', { name: '2. Announcements' }).getByRole('link', { name: 'Open Announcements' })).toBeVisible();
    await page.getByLabel('Presiding').fill('Bishop Hall');
    await introduction.getByRole('button', { name: 'Save entry' }).click();
    await expect(introduction.getByRole('status')).toHaveText('Saved', { timeout: 120_000 });

    const persistedItemsResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${meetingId}/program-items`, 'GET');
    expect(persistedItemsResponse.status).toBe(200);
    const persistedIntroduction = (
      (persistedItemsResponse.body as { items: Array<{ itemType: string; introductionRoles?: { presiding?: string } }> }).items ?? []
    ).find((item) => item.itemType.toUpperCase() === 'INTRODUCTION');
    expect(persistedIntroduction?.introductionRoles?.presiding).toBe('Bishop Hall');

    await page.reload();
    await page.getByRole('button', { name: 'Content' }).click();
    await expect(page.getByRole('heading', { name: 'Program content' })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByLabel('Presiding')).toHaveValue('Bishop Hall');
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('region', { name: 'Document canvas' })).toBeVisible({ timeout: 30_000 });
    expect(browserErrors).toEqual([]);
  } finally {
    if (meetingId) {
      await cleanupPublishedMeeting(meetingId);
    }
  }
});
