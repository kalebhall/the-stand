import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
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
});
