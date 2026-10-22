import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test, type Page } from '@playwright/test';

const WARD_A = '11111111-1111-4111-8111-111111111111';
const WARD_B = '22222222-2222-4222-8222-222222222222';
const PUBLISHED_MEETING = '33333333-3333-4333-8333-333333333333';
const PUBLISHED_MEETING_WITHOUT_SAFE_SNAPSHOT = '33333333-3333-4333-8333-333333333334';
const COMPLETED_MEETING = '33333333-3333-4333-8333-333333333336';
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
        body: requestData === undefined ? undefined : JSON.stringify(requestData),
        cache: 'no-store'
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

test('meeting list secondary actions are disclosed in the mobile action menu', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meetings');

  const meetingCard = page.locator(`main a[href="/stand/${PUBLISHED_MEETING}"]`).last().locator('xpath=ancestor::article[1]');
  await expect(meetingCard).toBeVisible();
  await expect(meetingCard.getByRole('link', { name: 'At the Stand' })).toBeVisible();
  await expect(meetingCard.getByRole('link', { name: 'Edit' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const actionDisclosure = meetingCard.locator('details');
  const actionSummary = actionDisclosure.locator('summary[aria-label="More meeting actions"]');
  const printLink = meetingCard.getByRole('link', { name: 'Print view' });
  await expect(actionDisclosure).toHaveJSProperty('open', false);
  await expect(printLink).toBeHidden();
  await actionSummary.press('Enter');
  await expect(actionDisclosure).toHaveJSProperty('open', true);
  await expect(printLink).toBeVisible();
  await expect(meetingCard.getByRole('button', { name: 'Mark finished' })).toBeVisible();
  await expect(meetingCard.getByRole('button', { name: 'Delete' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/meetings');
  const finishedSummary = page.locator('main > details > summary').filter({ hasText: 'Finished meetings' }).last();
  const finishedMeetings = finishedSummary.locator('xpath=..');
  await expect(finishedMeetings).toHaveJSProperty('open', false);
  await finishedSummary.press('Enter');
  await expect(finishedMeetings).toHaveJSProperty('open', true);
  const finishedCard = page.locator(`main a[href="/stand/${COMPLETED_MEETING}"]`).last().locator('xpath=ancestor::article[1]');
  const finishedActions = finishedCard.locator('details');
  await finishedActions.locator('summary[aria-label="More meeting actions"]').press('Enter');
  await expect(finishedCard.getByRole('link', { name: 'Print view' })).toBeVisible();
  await expect(finishedCard.getByRole('button', { name: 'Reopen' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('meeting edit actions keep secondary links in a compact accessible menu', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/meetings/${PUBLISHED_MEETING}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit meeting' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'At the Stand' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editor help' })).toBeVisible();

    const actionDisclosure = page.locator('main details').first();
    const actionSummary = actionDisclosure.locator('summary[aria-label="More meeting actions"]');
    await expect(actionDisclosure).toHaveJSProperty('open', false);
    await actionSummary.press('Enter');
    await expect(actionDisclosure).toHaveJSProperty('open', true);
    await expect(page.getByRole('link', { name: 'Open print view' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Preview public program' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await actionSummary.press('Enter');
    await expect(actionDisclosure).toHaveJSProperty('open', false);
  }
});

test('meeting creation controls stay unwrapped without mobile horizontal overflow', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meetings/new');
  await expect(page.getByRole('heading', { name: 'Create meeting' })).toBeVisible();

  const addItemButton = page.getByRole('button', { name: 'Add item' });
  await expect(addItemButton).toBeVisible();
  await expect
    .poll(() =>
      addItemButton.evaluate((button) => {
        const range = document.createRange();
        range.selectNodeContents(button);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
      })
    )
    .toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('membership and ordinances title and action have room on mobile', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/membership-ordinances');

  const heading = page.getByRole('heading', { name: 'Membership & Ordinances' });
  await expect(heading).toBeVisible();
  await expect.poll(() => heading.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(48);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const meetingsLink = page.locator('main a[href="/meetings"]');
  await expect(meetingsLink).toBeVisible();
  await expect
    .poll(() =>
      meetingsLink.evaluate((link) => {
        const range = document.createRange();
        range.selectNodeContents(link);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
      })
    )
    .toBe(1);
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

    await page.goto(`/meetings/${id}/edit`);
    const wardBusinessHeading = page.getByRole('heading', { name: 'Ward Business' });
    await expect(wardBusinessHeading).toBeVisible();
    const membershipLink = page.getByRole('link', { name: 'Open Membership and Ordinances' });
    await expect(membershipLink).toBeVisible();
    await expect(membershipLink).toHaveAttribute('href', '/membership-ordinances');
    // Callings is optional and disabled for the shared E2E ward; do not render a dead link.
    await expect(page.getByRole('link', { name: 'Open Callings' })).toHaveCount(0);
    await expect(page.getByText('Welcome, blessing, and priesthood actions for this meeting.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Membership and Ordinances' })).toHaveCount(0);
    await expect(
      wardBusinessHeading.locator('xpath=ancestor::section[1]').getByRole('link', { name: 'Open Membership and Ordinances' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ward and Stake Business' })).toHaveCount(0);

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
  const businessSection = page.locator('details').filter({ hasText: 'Ward and Stake Business' });
  await expect(businessSection).toHaveAttribute('open');
  await expect(businessSection).toContainText('3 pending');
  const welcomeAction = page.locator('li').filter({ hasText: 'E2E Welcome Member' });
  const baptismFollowUpAction = page.locator('li').filter({ hasText: 'E2E Baptism Follow-up' });
  const priesthoodAction = page.locator('li').filter({ hasText: 'E2E Priesthood Member' });
  await expect(welcomeAction).toContainText('Welcome script: E2E Welcome Member.');
  await expect(baptismFollowUpAction).toContainText('Welcome script: E2E Baptism Follow-up.');
  await expect(priesthoodAction).toContainText('Priesthood script: E2E Priesthood Member — Priest.');
  await expect(page.getByText('PRIVATE WELCOME ACTION NOTES', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PRIVATE BAPTISM FOLLOW-UP NOTES', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PRIVATE PRIESTHOOD ACTION NOTES', { exact: true })).toHaveCount(0);

  await page.goto(`/stand/${PUBLISHED_MEETING}?mode=compact`);
  await expect(page.getByText('Compact Labels')).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'E2E Welcome Member' })).not.toContainText('Welcome script:');
  await expect(page.locator('li').filter({ hasText: 'E2E Priesthood Member' })).not.toContainText('Priesthood script:');
});

test('public portal exposes published snapshot', async ({ page }) => {
  await page.goto('/p/meeting-token-e2e');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.getByText('E2E Ward A')).toBeVisible();

  await page.goto('/p/ward/portal-token-e2e');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.getByText('E2E Ward A')).toBeVisible();
});

test('published print page fails closed without a safe stored snapshot', async ({ page }) => {
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  await page.goto(`/meetings/${PUBLISHED_MEETING_WITHOUT_SAFE_SNAPSHOT}/print`);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Sacrament meeting program' })).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'Content', exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Advanced Mode' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Add content' })).toBeVisible();
    await expect(page.getByText('Customize layout', { exact: true })).toBeVisible();
    await expect
      .poll(() => page.getByRole('heading', { name: 'Meeting program' }).evaluate((heading) => heading.getBoundingClientRect().height))
      .toBeLessThan(48);
    await page.setViewportSize({ width: 390, height: 844 });
    const heading = page.locator('main h1');
    await expect.poll(() => heading.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(48);

    const originalHeading = await heading.textContent();
    await heading.evaluate((element) => {
      element.textContent = 'Programa de la reunión sacramental del barrio';
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await heading.evaluate((element, original) => {
      element.textContent = original;
    }, originalHeading);

    const status = page.locator('header [role="status"]');
    const originalStatus = await status.textContent();
    await status.evaluate((element) => {
      element.textContent = `Error ${'x'.repeat(240)}`;
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await status.evaluate((element, original) => {
      element.textContent = original;
    }, originalStatus);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole('button', { name: 'Content', exact: true }).click();
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
    await page.getByRole('button', { name: 'Content', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Program content' })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByLabel('Presiding')).toHaveValue('Bishop Hall');
    expect(browserErrors).toEqual([]);
  } finally {
    if (meetingId) {
      await cleanupPublishedMeeting(meetingId);
    }
  }
});

test('Program Designer creates, saves, reloads, and previews structural blocks', async ({ page }) => {
  const browserErrors: string[] = [];
  const programWriteRequests: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/program-design') && request.method() === 'PUT') programWriteRequests.push(request.postData() ?? '');
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('/program-design')) programWriteRequests.push(`FAILED ${request.failure()?.errorText ?? 'unknown'}`);
  });
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  let meetingId: string | null = null;
  try {
    const createResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings`, 'POST', {
      meetingDate: '2026-12-13',
      meetingType: 'SACRAMENT',
      programItems: [
        { itemType: 'INTRODUCTION', title: 'Welcome' },
        { itemType: 'ANNOUNCEMENT', title: 'Structural block acceptance' }
      ]
    });
    expect(createResponse.status, JSON.stringify(createResponse.body)).toBe(201);
    meetingId = (createResponse.body as { id: string }).id;
    await page.goto(`/programs/${meetingId}`);
    await expect(page.getByRole('region', { name: 'Document canvas' })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Advanced Mode' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Add content' })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Customize layout', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').first()).toHaveText('Saved', { timeout: 120_000 });

    await page.getByText('Customize layout', { exact: true }).click();
    await page.getByRole('button', { name: 'Add section heading' }).click();
    await page.getByLabel('Section heading title').fill('Community');
    await page.getByLabel('Section heading subtitle').fill('This week');
    await page.getByLabel('Section heading display').selectOption('ACCENT');

    await page.getByRole('button', { name: 'Add simple list' }).click();
    await page.getByRole('button', { name: 'Add list item' }).click();
    const properties = page.getByRole('complementary', { name: 'Properties' });
    await properties.getByRole('textbox').nth(0).fill('Food drive');
    await page.getByRole('button', { name: 'Add list item' }).click();
    await properties.getByRole('textbox').nth(1).fill('Youth activity');
    await page.getByRole('button', { name: 'Move list item 2 up' }).click();
    await page.getByLabel('Simple list display').selectOption('NUMBERED');
    await page.getByRole('button', { name: /^Add announcement list/ }).click();
    await page.getByRole('button', { name: 'Add announcement item' }).click();
    await properties.getByLabel('Title for announcement 1').fill('Community dinner');
    await properties.getByLabel('Date for announcement 1').fill('Saturday evening');
    await properties.getByLabel('Description for announcement 1').fill('Bring a side dish.');
    await properties.getByLabel('Location for announcement 1').fill('Cultural hall');
    await properties.getByLabel('Contact for announcement 1').fill('Relief Society');
    const advancedSavePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/w/${WARD_A}/meetings/${meetingId}/program-design`) && response.request().method() === 'PUT',
      { timeout: 15_000 }
    );
    await page.getByRole('button', { name: 'Save layout' }).click();
    await expect.poll(() => programWriteRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const advancedSavePayload = JSON.parse(programWriteRequests.at(-1)!) as {
      document: { pages: Array<{ regions: Array<{ blocks: Array<{ type: string }> }> }> };
    };
    const requestBlocks = advancedSavePayload.document.pages.flatMap((programPage) =>
      programPage.regions.flatMap((region) => region.blocks)
    );
    expect(requestBlocks.map((block) => block.type)).toContain('SECTION_HEADING');
    expect(requestBlocks.map((block) => block.type)).toContain('SIMPLE_LIST');
    const advancedSave = await advancedSavePromise;
    expect(advancedSave.ok(), `Layout save failed: ${advancedSave.status()} ${await advancedSave.text()}`).toBe(true);
    const advancedSaveBody = (await advancedSave.json()) as {
      document?: { layout?: { pages: Array<{ regions: Array<{ blocks: Array<{ type: string }> }> }> } };
    };
    const responseBlocks =
      advancedSaveBody.document?.layout?.pages.flatMap((programPage) => programPage.regions.flatMap((region) => region.blocks)) ?? [];
    expect(responseBlocks.map((block) => block.type)).toContain('SECTION_HEADING');
    expect(responseBlocks.map((block) => block.type)).toContain('SIMPLE_LIST');
    await expect(page.getByRole('status').first()).toHaveText('Saved', { timeout: 120_000 });

    const savedResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings/${meetingId}/program-design`, 'GET');
    expect(savedResponse.status).toBe(200);
    const advancedLayout = (
      savedResponse.body as {
        document?: {
          advancedLayout?: { pages: Array<{ regions: Array<{ blocks: Array<{ type: string; config: Record<string, unknown> }> }> }> };
        };
      }
    ).document?.advancedLayout;
    expect(advancedLayout, JSON.stringify(savedResponse.body)).toBeDefined();
    const blocks = advancedLayout!.pages.flatMap((programPage) => programPage.regions.flatMap((region) => region.blocks));
    expect(blocks.map((block) => block.type)).toContain('SECTION_HEADING');
    expect(blocks.find((block) => block.type === 'SECTION_HEADING')!.config).toMatchObject({
      title: 'Community',
      subtitle: 'This week',
      presentation: 'ACCENT'
    });
    expect(blocks.find((block) => block.type === 'SIMPLE_LIST')?.config).toMatchObject({
      presentation: 'NUMBERED',
      items: [{ text: 'Youth activity' }, { text: 'Food drive' }]
    });
    expect(blocks.find((block) => block.type === 'ANNOUNCEMENT_LIST')?.config).toMatchObject({
      items: [
        {
          title: 'Community dinner',
          date: 'Saturday evening',
          description: 'Bring a side dish.',
          location: 'Cultural hall',
          contact: 'Relief Society'
        }
      ]
    });

    const publicValidation = await apiRequest(page, `/api/w/${WARD_A}/meetings/${meetingId}/program-design`, 'POST', {
      mode: 'ADVANCED',
      document: advancedLayout
    });
    expect(publicValidation.status, JSON.stringify(publicValidation.body)).toBe(200);
    expect(publicValidation.body).toMatchObject({ publicSafe: true });

    const privatePreviewLayout = structuredClone(advancedLayout!) as {
      pages: Array<{
        regions: Array<{
          blocks: Array<Record<string, unknown>>;
          columns: { blockIds: string[][] };
        }>;
      }>;
    };
    const privateRegion = privatePreviewLayout.pages[0].regions[0];
    const privateBlockId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    privateRegion.blocks.push({
      ...privateRegion.blocks[0],
      id: privateBlockId,
      type: 'WARD_LEADERSHIP',
      dataMode: 'AUTO',
      config: { text: 'PRIVATE_SENTINEL' }
    });
    privateRegion.columns.blockIds[0].push(privateBlockId);
    const privateValidationResponse = await page.request.post(
      new URL(`/api/w/${WARD_A}/meetings/${meetingId}/program-design`, page.url()).toString(),
      { data: { mode: 'ADVANCED', document: privatePreviewLayout } }
    );
    const privateValidationBody = (await privateValidationResponse.json()) as Record<string, unknown>;
    expect(privateValidationResponse.status()).toBe(422);
    expect(privateValidationBody).toMatchObject({ code: 'UNSAFE_PUBLIC_DOCUMENT' });
    expect(JSON.stringify(privateValidationBody)).not.toContain('PRIVATE_SENTINEL');

    await page.reload();
    await expect(page.getByRole('region', { name: 'Document canvas' })).toBeVisible({ timeout: 120_000 });
    await page.getByText('Customize layout', { exact: true }).click();
    const approvedBlocks = page.getByRole('complementary', { name: 'Approved blocks' });
    await approvedBlocks.getByRole('button', { name: /^Section heading / }).click();

    await expect(page.getByLabel('Section heading title')).toHaveValue('Community', { timeout: 10_000 });
    await approvedBlocks.getByRole('button', { name: /^Simple list / }).click();
    await expect(properties.getByRole('textbox').nth(0)).toHaveValue('Youth activity', { timeout: 10_000 });
    await expect(properties.getByRole('textbox').nth(1)).toHaveValue('Food drive', { timeout: 10_000 });

    await page.getByRole('button', { name: 'Desktop preview' }).click();
    const digital = page.locator('.document-root[data-target="DIGITAL"]');
    await expect(digital).toContainText('Community');
    await expect(digital.locator('ol.document-simple-list')).toContainText('Youth activity');
    await expect(digital.locator('.document-announcement-list')).toContainText('Community dinner');
    await expect(digital).toHaveAttribute('data-document-type', 'SACRAMENT_PROGRAM');
    await expect(digital).toHaveAttribute('aria-label', /.+/);
    expect(await digital.evaluate((element) => element.tagName)).toBe('SECTION');
    await expect(digital.locator('main')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Preview as public visitor' }).check();
    await expect(page.locator('.document-root[data-target="DIGITAL"]')).toContainText('Food drive');
    await expect(page.locator('.document-root[data-target="DIGITAL"] .document-announcement-list')).toContainText('Community dinner');

    await page.getByRole('button', { name: 'Print preview' }).click();
    const print = page.locator('.document-root[data-target="PRINT"]');
    await expect(print).toContainText('Community');
    await expect(print.locator('ol.document-simple-list')).toContainText('Food drive');
    await expect(print.locator('.document-announcement-list')).toContainText('Bring a side dish.');
    expect(await print.evaluate((element) => element.tagName)).toBe('SECTION');
    await expect(print.locator('main')).toHaveCount(0);
    await page.getByRole('button', { name: 'Phone preview' }).click();
    const mobile = page.locator('.document-root--mobile[data-target="DIGITAL"]');
    await expect(mobile).toBeVisible();
    await expect(mobile).toHaveAttribute('data-document-type', 'SACRAMENT_PROGRAM');
    await expect(mobile).toHaveAttribute('aria-label', /.+/);
    expect(await mobile.evaluate((element) => element.tagName)).toBe('SECTION');
    await expect(mobile.locator('main')).toHaveCount(0);
    const documentColumns = mobile.locator('.document-columns').first();
    await expect(documentColumns).toBeVisible();
    const columns = await documentColumns.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
    );
    expect(columns).toBe(1);
    expect(browserErrors).toEqual([]);
  } finally {
    if (meetingId) await cleanupPublishedMeeting(meetingId);
  }
});

test('program designer drag reorder persists after reload', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await login(page, 'ward-admin@example.test', 'WardAdminPassword123456789012');
  let meetingId: string | null = null;
  try {
    const createResponse = await apiRequest(page, `/api/w/${WARD_A}/meetings`, 'POST', {
      meetingDate: '2026-12-27',
      meetingType: 'SACRAMENT',
      programItems: [
        { itemType: 'INTRODUCTION', title: 'Introduction' },
        { itemType: 'ANNOUNCEMENT', title: 'Drag reorder acceptance' },
        { itemType: 'SPEAKER', title: 'Alex Example', topic: 'Service' }
      ]
    });
    expect(createResponse.status, JSON.stringify(createResponse.body)).toBe(201);
    meetingId = (createResponse.body as { id: string }).id;

    const initialDesignResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/w/${WARD_A}/meetings/${meetingId}/program-design`) && response.request().method() === 'GET'
    );
    await page.goto(`/programs/${meetingId}`);
    const designResponse = await initialDesignResponsePromise;
    expect(designResponse.status()).toBe(200);
    const initialLayout = (
      (await designResponse.json()) as { document: { layout: { pages: Array<{ regions: Array<{ blocks: Array<{ id: string }> }> }> } } }
    ).document.layout;
    const initialBlockIds = initialLayout.pages[0].regions[0].blocks.map((block) => block.id);
    expect(initialBlockIds.length).toBeGreaterThan(1);

    await expect(page.getByRole('region', { name: 'Document canvas' })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Advanced Mode' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Add content' })).toBeVisible();
    await expect(page.getByText('Customize layout', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').first()).toHaveText('Saved', { timeout: 120_000 });
    const approvedBlocks = page.getByRole('complementary', { name: 'Approved blocks' });
    const blockRows = approvedBlocks.locator('ul > li');
    const firstLabel = (await blockRows.nth(0).locator('button').first().innerText()).split('\n')[0].trim();
    const secondLabel = (await blockRows.nth(1).locator('button').first().innerText()).split('\n')[0].trim();
    const targetBox = await blockRows.nth(1).boundingBox();
    expect(targetBox).not.toBeNull();

    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/w/${WARD_A}/meetings/${meetingId}/program-design`) && response.request().method() === 'PUT'
    );
    await blockRows.nth(0).dragTo(blockRows.nth(1), {
      targetPosition: { x: Math.floor(targetBox!.width / 2), y: Math.max(1, Math.floor(targetBox!.height - 1)) }
    });
    await expect(blockRows.nth(0).locator('button').first()).toContainText(secondLabel);
    await expect(blockRows.nth(1).locator('button').first()).toContainText(firstLabel);
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok(), `program layout PUT failed: ${saveResponse.status()} ${await saveResponse.text()}`).toBe(true);

    const persistedDesign = await apiRequest(page, `/api/w/${WARD_A}/meetings/${meetingId}/program-design`, 'GET');
    expect(persistedDesign.status).toBe(200);
    const persistedLayout = (
      persistedDesign.body as { document: { layout: { pages: Array<{ regions: Array<{ blocks: Array<{ id: string }> }> }> } } }
    ).document.layout;
    expect(persistedLayout.pages[0].regions[0].blocks.map((block) => block.id).slice(0, 2)).toEqual([
      initialBlockIds[1],
      initialBlockIds[0]
    ]);

    await page.reload();
    await expect(page.getByRole('region', { name: 'Document canvas' })).toBeVisible({ timeout: 30_000 });
    const reloadedRows = page.getByRole('complementary', { name: 'Approved blocks' }).locator('ul > li');
    await expect(reloadedRows.nth(0).locator('button').first()).toContainText(secondLabel);
    await expect(reloadedRows.nth(1).locator('button').first()).toContainText(firstLabel);
    await page.getByRole('button', { name: 'Phone preview' }).click();
    const mobileAgendaRow = page.locator('.document-root--mobile .document-key-value').first();
    await expect(mobileAgendaRow).toBeVisible();
    const mobileGridTrackCount = await mobileAgendaRow.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
    );
    expect(mobileGridTrackCount).toBe(1);
    expect(browserErrors).toEqual([]);
  } finally {
    if (meetingId) {
      await cleanupPublishedMeeting(meetingId);
    }
  }
});
