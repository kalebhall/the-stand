import { describe, expect, it } from 'vitest';
import { validatePublicLayout } from './public-layout';

describe('public layout validation', () => {
  it('accepts supported text-first presets', () => expect(validatePublicLayout({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })).toBeNull());
  it('rejects unsupported layout values', () => expect(validatePublicLayout({ preset: 'CUSTOM', announcementMode: 'NONE', coverMode: 'NONE' })).toBe('Unsupported public layout preset.'));
});
