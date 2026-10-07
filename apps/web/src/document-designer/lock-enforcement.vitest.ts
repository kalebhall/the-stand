import { describe, expect, it } from 'vitest';

import { normalizeToAdvanced } from './advanced-schema';
import { assertNoLockedChanges, LockedLayoutError } from './lock-enforcement';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';

describe('advanced layout visibility locks', () => {
  it.each(['document', 'page', 'region', 'block'] as const)('rejects visibilityRule changes at the %s lock scope', (scope) => {
    const previous = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const block = previous.pages[0].regions[0].blocks[0];
    block.visibilityRule = 'ALWAYS';
    if (scope === 'document') previous.lock = { level: 'CONFIGURATION', properties: ['VISIBILITY'] };
    if (scope === 'page') previous.pages[0].lock = { level: 'REGION', properties: ['VISIBILITY'] };
    if (scope === 'region') previous.pages[0].regions[0].lock = { level: 'REGION', properties: ['VISIBILITY'] };
    if (scope === 'block') block.lock = { level: 'BLOCK', properties: ['VISIBILITY'] };

    const next = structuredClone(previous);
    next.pages[0].regions[0].blocks[0].visibilityRule = 'WHEN_PUBLIC';

    expect(() => assertNoLockedChanges(previous, next)).toThrow(LockedLayoutError);
  });

  it('protects document-level region dimensions under a SIZE lock', () => {
    const previous = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    previous.lock = { level: 'CONFIGURATION', properties: ['SIZE'] };
    const next = structuredClone(previous);
    next.pages[0].regions[0].ratio = 0.5;

    expect(() => assertNoLockedChanges(previous, next)).toThrow(LockedLayoutError);
  });

  it('protects block semantic identity under a CONTENT lock', () => {
    const previous = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    previous.lock = { level: 'CONFIGURATION', properties: ['CONTENT'] };
    const next = structuredClone(previous);
    next.pages[0].regions[0].blocks[0].printBehavior = 'PRINT_ONLY';

    expect(() => assertNoLockedChanges(previous, next)).toThrow(LockedLayoutError);
  });
});
