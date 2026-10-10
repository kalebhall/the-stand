import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { normalizeToAdvanced } from './advanced-schema';
import { inheritTemplate } from './inheritance';

describe('meeting document inheritance', () => {
  it('copies a validated template without changing source identity or layout IDs', () => {
    const source = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const inherited = inheritTemplate(source, 'template-1', 3);
    expect(inherited.sourceTemplateId).toBe('template-1');
    expect(inherited.sourceTemplateVersion).toBe(3);
    expect(inherited.layout.id).toBe(source.id);
    expect(inherited.theme).toEqual(source.theme);
    expect(inherited.layout).not.toBe(source);
  });

  it('preserves schema-v2 columns and advanced metadata when inheriting a template', () => {
    const source = normalizeToAdvanced(adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' }));
    const inherited = inheritTemplate(source, 'template-v2', 4);
    expect(inherited.layout.schemaVersion).toBe(2);
    expect((inherited.layout.pages[0].regions[0] as { columns?: unknown }).columns).toEqual(source.pages[0].regions[0].columns);
  });
});
