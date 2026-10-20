import { expect, test } from '@playwright/test';

const wardId = '11111111-1111-4111-8111-111111111111';
const meetingId = '33333333-3333-4333-8333-333333333333';

const routes = [
  '/dashboard',
  '/meetings',
  '/meetings/new',
  `/meetings/${meetingId}/edit`,
  '/programs',
  `/programs/${meetingId}`,
  '/programs/templates',
  '/programs/baptism',
  '/actions-to-do',
  '/membership-ordinances',
  '/members',
  '/callings',
  '/announcements',
  '/notifications',
  '/speakers',
  '/interviews',
  '/ward-council',
  '/bishopric',
  '/missionary-coordination',
  '/technology',
  '/reports',
  '/reports/notes',
  '/imports',
  '/imports/members',
  '/imports/callings',
  '/settings',
  '/settings/notifications',
  '/settings/public-portal',
  '/settings/public-layout',
  '/settings/stand-script',
  '/settings/audit-log'
];

test('all-modules responsive visual audit', async ({ page }) => {
  test.skip(process.env.E2E_VISUAL_AUDIT !== '1', 'Run explicitly with E2E_VISUAL_AUDIT=1; fixture modules and admin role are test-only.');
  await page.goto('/login');
  await page.locator('input[name="email"]').fill('ward-admin@example.test');
  await page.locator('input[name="password"]').fill('WardAdminPassword123456789012');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  const readModules = async () =>
    page.evaluate(async (id) => {
      const response = await fetch(`/api/w/${id}/module-settings`);
      return { status: response.status, body: await response.json() };
    }, wardId);
  const original = await readModules();
  expect(original.status).toBe(200);
  const originalStates = original.body.modules.map((module: { id: string; enabled: boolean }) => ({
    id: module.id,
    enabled: module.enabled
  }));

  try {
    await page.goto('/settings');
    const panel = page.locator('[aria-label="Module settings"]');
    await expect(panel).toBeVisible();
    for (const [index, module] of original.body.modules.entries()) {
      if (!module.canDisable || module.enabled) continue;
      const row = panel.locator(':scope > div').nth(index);
      await expect(row).toContainText(module.name);
      await row.getByRole('button').click();
      await expect(row.getByRole('button')).toHaveText('Enabled');
    }
    const enabled = await readModules();
    expect(enabled.status).toBe(200);
    const disabled = enabled.body.modules.filter(
      (module: { canDisable: boolean; enabled: boolean }) => module.canDisable && !module.enabled
    );
    expect(disabled).toEqual([]);
    const session = await page.evaluate(async () => await (await fetch('/api/auth/session')).json());
    console.log(
      `MODULE_STATE ${JSON.stringify({ enabled: enabled.body.modules.filter((m: { enabled: boolean }) => m.enabled).map((m: { id: string }) => m.id), sessionRoles: session?.user?.roles, activeWardId: session?.activeWardId })}`
    );

    const findings = [];
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        if (route === '/technology') {
          const technologyApi = await page.evaluate(
            async ({ wardId, meetingId }) => {
              const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/technology`);
              return { status: response.status, body: await response.json() };
            },
            { wardId, meetingId }
          );
          expect(technologyApi.status).toBe(200);
        }
        await page.waitForTimeout(150);
        findings.push(
          await page.evaluate(
            ({ requested, width }) => {
              const heading = document.querySelector('h1');
              const headingLines = (() => {
                if (!heading) return 0;
                const range = document.createRange();
                range.selectNodeContents(heading);
                return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
              })();
              const wrappedButtons = Array.from(document.querySelectorAll('button'))
                .filter((button) => {
                  if (!button.getClientRects().length || button.querySelector('p')) return false;
                  const range = document.createRange();
                  range.selectNodeContents(button);
                  const lines = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
                  return lines > 1;
                })
                .map((button) => button.innerText.trim().replace(/\s+/g, ' ').slice(0, 70));
              const actionButtonWraps = Array.from(document.querySelectorAll('button')).flatMap((button) => {
                if (!button.getClientRects().length) return [];
                const label = button.innerText.trim().replace(/\s+/g, ' ');
                if (
                  ![
                    'Interview complete',
                    'Mark announced',
                    'Mark Sustained',
                    'Convert to Assigned',
                    'View Changes',
                    'View Details'
                  ].includes(label)
                )
                  return [];
                const range = document.createRange();
                range.selectNodeContents(button);
                const lines = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
                return lines > 1 ? [{ label, lines, width: Math.round(button.getBoundingClientRect().width) }] : [];
              });
              const textBoxes = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select, [contenteditable="true"]')).filter((element) => {
                const style = getComputedStyle(element);
                return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
              });
              const textBoxOverlaps = textBoxes.flatMap((first, index) => textBoxes.slice(index + 1).flatMap((second) => {
                if (first.contains(second) || second.contains(first)) return [];
                const a = first.getBoundingClientRect();
                const b = second.getBoundingClientRect();
                const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (overlapWidth <= 2 || overlapHeight <= 2) return [];
                const label = (element: Element) => element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || element.closest('label')?.textContent?.trim() || element.tagName.toLowerCase();
                return [{ first: label(first), second: label(second), overlapWidth: Math.round(overlapWidth), overlapHeight: Math.round(overlapHeight) }];
              }));
              const overflowElements = Array.from(document.querySelectorAll('body *'))
                .filter((element) => {
                  const rect = element.getBoundingClientRect();
                  return rect.right > window.innerWidth + 1 || rect.left < -1 || element.scrollWidth > element.clientWidth + 2;
                })
                .slice(0, 8)
                .map((element) => {
                  const rect = element.getBoundingClientRect();
                  return {
                    tag: element.tagName.toLowerCase(),
                    className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
                    text: (element.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 80),
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth
                  };
                });
              return {
                width,
                requested,
                path: location.pathname,
                heading: heading?.textContent?.trim() ?? null,
                headingLines,
                horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                wrappedButtons,
                actionButtonWraps,
                textBoxOverlaps,
                overflowElements
              };
            },
            { requested: route, width }
          )
        );
      }
    }
    const longToken = 'UNBROKEN'.repeat(40);
    await page.route(`**/api/w/${wardId}/notifications*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          unreadCount: 1,
          notifications: [
            {
              id: 'visual-audit-notification',
              eventType: 'SYSTEM',
              category: 'SYSTEM',
              title: `Long notification ${longToken}`,
              summary: `Long notification summary ${longToken}`,
              details: { reference: longToken },
              severity: 'info',
              targetUrl: null,
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ]
        })
      })
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/notifications');
      const title = page.locator('article button').first();
      await expect(title).toBeVisible();
      await title.click();
      const notificationOverflow = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        elements: Array.from(document.querySelectorAll('article, article *'))
          .filter((element) => element.scrollWidth > element.clientWidth + 2)
          .slice(0, 12)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === 'string' ? element.className : '',
            text: (element.textContent ?? '').trim().slice(0, 60),
            overflowWrap: getComputedStyle(element).overflowWrap,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
          }))
      }));
      console.log(`NOTIFICATION_CONTENT_OVERFLOW ${JSON.stringify(notificationOverflow)}`);
      expect(notificationOverflow.documentWidth).toBeLessThanOrEqual(width);
      expect(notificationOverflow.elements).toEqual([]);
    }
    const overflows = findings
      .filter((row) => row.horizontalOverflow)
      .map(({ width, requested, path, overflowElements }) => ({ width, requested, path, overflowElements }));
    const redirects = findings
      .filter((row) => row.path !== row.requested)
      .map(({ width, requested, path, heading }) => ({ width, requested, path, heading }));
    const actionWraps = findings.flatMap((row) =>
      row.actionButtonWraps.map((item) => ({ width: row.width, requested: row.requested, ...item }))
    );
    const textBoxOverlaps = findings.flatMap((row) =>
      row.textBoxOverlaps.map((item) => ({ width: row.width, requested: row.requested, ...item }))
    );
    console.log(`AUDIT_OVERFLOWS ${JSON.stringify(overflows)}`);
    console.log(`AUDIT_BUTTON_WRAPS ${JSON.stringify(actionWraps)}`);
    console.log(`AUDIT_TEXTBOX_OVERLAPS ${JSON.stringify(textBoxOverlaps)}`);
    console.log(`AUDIT_REDIRECTS ${JSON.stringify(redirects)}`);
    expect(overflows).toEqual([]);
    expect(actionWraps).toEqual([]);
    expect(textBoxOverlaps).toEqual([]);
    expect(redirects.filter((row) => row.requested === '/technology')).toEqual([]);
  } finally {
    await page.evaluate(
      async ({ id, states }) => {
        for (const state of states) {
          if (state.enabled) continue;
          const response = await fetch(`/api/w/${id}/module-settings`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ moduleId: state.id, enabled: false })
          });
          if (!response.ok) throw new Error(`Failed to restore module ${state.id}: ${response.status}`);
        }
      },
      { id: wardId, states: originalStates }
    );
    const restored = await readModules();
    expect(restored.status).toBe(200);
    expect(restored.body.modules.map((module: { id: string; enabled: boolean }) => ({ id: module.id, enabled: module.enabled }))).toEqual(
      originalStates
    );
  }
});
