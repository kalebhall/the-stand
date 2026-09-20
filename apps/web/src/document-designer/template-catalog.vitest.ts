import { describe, expect, it } from 'vitest';

import { BUILT_IN_TEMPLATES, getBuiltInTemplate } from './built-in-templates';
import { documentLayoutSchema } from './schema';

describe('built-in document templates', () => {
  it('contains the required eight stable templates', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(8);
    expect(BUILT_IN_TEMPLATES.map((template) => template.name)).toEqual([
      'Classic Bifold',
      'Trifold Bulletin',
      'Full Page Standard',
      'Modern Minimal',
      'Compact One Page',
      'Large Print',
      'Image Cover',
      'Announcement Focus'
    ]);
  });

  it('validates every catalog layout and resolves stable keys', () => {
    for (const template of BUILT_IN_TEMPLATES) expect(documentLayoutSchema.parse(template.layout)).toEqual(template.layout);
    expect(getBuiltInTemplate('classic-bifold')?.layout.fold).toBe('BIFOLD');
    expect(getBuiltInTemplate('missing')).toBeNull();
  });

  it('does not expose internal-only blocks in built-in defaults', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const types = template.layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks.map((block) => block.type)));
      expect(types).not.toContain('WARD_LEADERSHIP');
      expect(types).not.toContain('MISSIONARIES_ASSIGNED');
    }
  });
});
