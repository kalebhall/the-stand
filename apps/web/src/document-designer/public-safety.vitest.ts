import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { PublicSafetyError, validatePublicDocumentLayout } from './public-safety';

describe('public document safety', () => {
  it('rejects internal blocks and requires explicit public block approval', () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    expect(() => validatePublicDocumentLayout(layout)).toThrow(/explicit public approval/);
    expect(() => validatePublicDocumentLayout(layout, ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'])).not.toThrow();
    const privateBlock = { ...layout.pages[0].regions[0].blocks[0], type: 'WARD_LEADERSHIP', config: { text: 'private' } } as never;
    const unsafe = { ...layout, pages: [{ ...layout.pages[0], regions: [{ ...layout.pages[0].regions[0], blocks: [privateBlock] }] }] };
    expect(() => validatePublicDocumentLayout(unsafe)).toThrow(PublicSafetyError);
  });
});
