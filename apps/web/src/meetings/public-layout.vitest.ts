import { describe, expect, it } from 'vitest';
import { validatePublicLayout } from './public-layout';

describe('public layout validation', () => {
  it('accepts supported text-first presets', () => expect(validatePublicLayout({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })).toBeNull());
  it('rejects unsupported layout values', () => expect(validatePublicLayout({ preset: 'CUSTOM', announcementMode: 'NONE', coverMode: 'NONE' })).toBe('Unsupported public layout preset.'));
  it('requires HTTPS and alt text for cover images', () => {
    expect(validatePublicLayout({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'AUTHORIZED_IMAGE', coverImageUrl: 'http://bad.test/image.jpg', coverImageAltText: 'Image' })).toContain('HTTPS');
    expect(validatePublicLayout({ preset: 'FULL_PAGE', announcementMode: 'NONE', coverMode: 'AUTHORIZED_IMAGE', coverImageUrl: 'https://good.test/image.jpg' })).toContain('alt text');
  });
});
