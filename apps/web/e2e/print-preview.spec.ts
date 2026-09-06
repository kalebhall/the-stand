import { expect, test } from '@playwright/test';

import { buildMeetingRenderHtml, type MeetingRenderInput } from '../src/meetings/render';

const fixture: MeetingRenderInput = {
  meetingDate: '2026-02-08',
  meetingType: 'SACRAMENT',
  programItems: [
    {
      itemType: 'SPEAKER',
      title: 'Jane Doe',
      notes: null,
      topic: 'Finding peace through prayer',
      programNotes: null,
      hymnNumber: null,
      hymnTitle: null
    }
  ],
  announcements: [],
  publicUrl: 'https://thestand.app/p/fixture-token'
};

test('renderer output changes fold layout under print media', async ({ page }) => {
  await page.emulateMedia({ media: 'screen' });

  for (const [preset, columns] of [
    ['SINGLE_SHEET_BIFOLD', '2'],
    ['TRI_FOLD_BULLETIN', '3'],
    ['FULL_PAGE', '1']
  ] as const) {
    await page.setContent(
      buildMeetingRenderHtml({
        ...fixture,
        layout: { preset, announcementMode: 'NONE', coverMode: 'NONE' }
      })
    );

    const program = page.locator('main.public-program');
    await expect(program).toHaveAttribute('aria-labelledby', 'public-program-title');
    await expect(program).toHaveAttribute('data-layout-preset', preset);
    await expect(program).toContainText('Finding peace through prayer');
    expect(await page.locator('style').textContent()).toContain('@media screen { .print-fold-guides { display: none; } }');

    await page.emulateMedia({ media: 'print' });
    await expect(program).toHaveCSS('column-count', columns);
    if (preset === 'FULL_PAGE') {
      await expect(page.locator('.print-fold-guides')).toHaveCount(0);
    } else {
      await expect(page.locator('.print-fold-guides')).toBeVisible();
    }
  }
});
