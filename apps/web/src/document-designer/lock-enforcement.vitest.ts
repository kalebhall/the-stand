import { describe, expect, it } from 'vitest';

import { normalizeToAdvanced } from './advanced-schema';
import { assertNoLockedChanges, LockedLayoutError } from './lock-enforcement';
import { configureColumns } from './layout-operations';
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

  it('protects a block position lock when its column assignment changes', () => {
    const previous = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const region = previous.pages[0].regions[0];
    const positionLockedBlock = region.blocks[1];
    positionLockedBlock.lock = { level: 'BLOCK', properties: ['POSITION'] };

    const next = configureColumns(previous, 0, 0, 2, '1/3+2/3', 8);

    expect(() => assertNoLockedChanges(previous, next)).toThrow(LockedLayoutError);
  });

  it.each(['document', 'page', 'region', 'block'] as const)('protects folded-panel assignment under a %s POSITION lock', (scope) => {
    const previous = normalizeToAdvanced(
      adaptLegacyLayoutToDocument({ preset: 'SINGLE_SHEET_BIFOLD', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' })
    );
    const front = previous.pages[0].regions[0];
    const lockedBlock = front.blocks[0];
    if (scope === 'document') previous.lock = { level: 'CONFIGURATION', properties: ['POSITION'] };
    if (scope === 'page') previous.pages[0].lock = { level: 'REGION', properties: ['POSITION'] };
    if (scope === 'region') front.lock = { level: 'REGION', properties: ['POSITION'] };
    if (scope === 'block') lockedBlock.lock = { level: 'BLOCK', properties: ['POSITION'] };

    const next = structuredClone(previous);
    next.pages[0].regions[0].face = 'BACK_COVER';
    next.pages[0].regions[3].face = 'FRONT_COVER';

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
