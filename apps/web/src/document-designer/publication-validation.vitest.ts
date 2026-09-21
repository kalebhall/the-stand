import { describe, expect, it } from 'vitest';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { validatePublication } from './publication-validation';
import type { DocumentLayout } from './types';
import type { ResolvedDocumentData } from './render-types';

const data: ResolvedDocumentData = { meetingDate: '2026-01-01', meetingType: 'SACRAMENT', wardName: 'Ward', values: {}, meetingItems: [], warnings: [], media: {} };
const publicTypes = ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE', 'CUSTOM_TEXT', 'CUSTOM_LINK', 'IMAGE'];
const baseLayout = () => adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });

describe('publication validation', () => {
  it('blocks internal-only content and requires explicit public blocks', () => {
    const layout = baseLayout();
    const blocked = validatePublication({ layout, data });
    expect(blocked.valid).toBe(false);
    expect(blocked.errors.some((entry) => entry.code === 'UNSAFE_PUBLIC_DOCUMENT')).toBe(true);
    const allowed = validatePublication({ layout, data }, { explicitPublicBlockTypes: publicTypes });
    expect(allowed.errors.some((entry) => entry.code === 'UNSAFE_PUBLIC_DOCUMENT')).toBe(false);
  });

  it('rejects HTTP, credentialed, and unsupported public links through the HTTPS contract', () => {
    for (const href of ['http://example.com', 'https://user:password@example.com', 'javascript:alert(1)', 'mailto:test@example.com']) {
      const layout = baseLayout();
      const block = layout.pages[0].regions[0].blocks[0];
      const link = { ...block, type: 'CUSTOM_LINK', config: { label: 'Link', href } } as never;
      const unsafe = { ...layout, pages: [{ ...layout.pages[0], regions: [{ ...layout.pages[0].regions[0], blocks: [link] }] }] };
      const result = validatePublication({ layout: unsafe, data }, { explicitPublicBlockTypes: ['CUSTOM_LINK'] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((entry) => entry.code === 'INVALID_LAYOUT')).toBe(true);
    }
  });

  it('checks server-side media accessibility and availability', () => {
    const layout = baseLayout();
    const block = layout.pages[0].regions[0].blocks[0];
    const image = { ...block, type: 'IMAGE', config: { assetId: '00000000-0000-0000-0000-000000000000', alt: '', isDecorative: false } } as never;
    const imageLayout = { ...layout, pages: [{ ...layout.pages[0], regions: [{ ...layout.pages[0].regions[0], blocks: [image] }] }] };
    const unavailable = validatePublication({ layout: imageLayout, data }, { explicitPublicBlockTypes: ['IMAGE'] });
    expect(unavailable.errors.some((entry) => entry.code === 'IMAGE_UNAVAILABLE')).toBe(true);

    const accessibleLayout = imageLayout as DocumentLayout;
    const accessibleData = { ...data, media: { '00000000-0000-0000-0000-000000000000': { url: '/media/a', altText: null, isDecorative: false } } };
    const missingAlt = validatePublication({ layout: accessibleLayout, data: accessibleData }, { explicitPublicBlockTypes: ['IMAGE'] });
    expect(missingAlt.errors.some((entry) => entry.code === 'ALT_TEXT_REQUIRED')).toBe(true);
  });

  it('returns print errors and blocks them even when warnings are acknowledged', () => {
    const layout = baseLayout();
    const tooSmall = { ...layout, theme: { ...layout.theme, baseFontSize: 8 } };
    const result = validatePublication({ layout: tooSmall, data }, { explicitPublicBlockTypes: publicTypes, acknowledgedWarningCodes: ['FLOWING_PAGE_COUNT', 'UNKNOWN_CODE'] });
    expect(result.errors.some((entry) => entry.code === 'MIN_FONT_SIZE')).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('requires acknowledgement only for acknowledgement-required warnings', () => {
    const layout = { ...baseLayout(), fold: 'NONE' as const, pages: [{ ...baseLayout().pages[0], regions: [{ ...baseLayout().pages[0].regions[0], blocks: [{ ...baseLayout().pages[0].regions[0].blocks[0], type: 'CUSTOM_TEXT', config: { text: 'x'.repeat(10_000) } } as never] }] }] };
    const pending = validatePublication({ layout, data }, { explicitPublicBlockTypes: ['CUSTOM_TEXT'] });
    expect(pending.warningCodes).toContain('FLOWING_PAGE_COUNT');
    expect(pending.requiresWarningAcknowledgement).toBe(true);
    const acknowledged = validatePublication({ layout, data }, { explicitPublicBlockTypes: ['CUSTOM_TEXT'], acknowledgedWarningCodes: [...pending.warningCodes, 'UNKNOWN_CODE'] });
    expect(acknowledged.requiresWarningAcknowledgement).toBe(false);
    expect(acknowledged.valid).toBe(true);
  });
});
