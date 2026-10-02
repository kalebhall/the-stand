import { describe, expect, it } from 'vitest';

import {
  REUSABLE_BLOCK_CATALOG,
  REUSABLE_BLOCK_TYPES,
  getReusableBlockCatalogEntry,
  isReusableBlockType,
  assertReusableBlockOwnership,
  assertReusableBlockSnapshot,
  type ReusableBlockSnapshot
} from './reusable-blocks';

describe('reusable block catalog', () => {
  it('contains only safe reusable document block types', () => {
    expect(REUSABLE_BLOCK_CATALOG.map((entry) => entry.type)).toEqual([...REUSABLE_BLOCK_TYPES]);
    expect(REUSABLE_BLOCK_CATALOG.every((entry) => entry.sourceDriven === false)).toBe(true);
  });

  it('recognizes reusable block types without widening unsupported blocks', () => {
    expect(isReusableBlockType('CUSTOM_TEXT')).toBe(true);
    expect(isReusableBlockType('QR_CODE')).toBe(true);
    expect(isReusableBlockType('MEETING_PROGRAM')).toBe(false);
    expect(isReusableBlockType('DOCUMENT_TITLE')).toBe(false);
  });

  it('validates scoped ownership and snapshot versions', () => {
    expect(getReusableBlockCatalogEntry('CUSTOM_TEXT')).toEqual({ type: 'CUSTOM_TEXT', category: 'CONTENT', sourceDriven: false });
    expect(getReusableBlockCatalogEntry('IMAGE')).toEqual({ type: 'IMAGE', category: 'MEDIA', sourceDriven: false });
    expect(getReusableBlockCatalogEntry('MEETING_PROGRAM')).toBeNull();
    expect(() => assertReusableBlockOwnership({ scope: 'WARD', wardId: '11111111-1111-4111-8111-111111111111', stakeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerUserId: null })).not.toThrow();
    expect(() => assertReusableBlockOwnership({ scope: 'STAKE', wardId: null, stakeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerUserId: null })).not.toThrow();
    expect(() => assertReusableBlockOwnership({ scope: 'PERSONAL', wardId: '11111111-1111-4111-8111-111111111111', stakeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerUserId: '' })).toThrow('owner');

    expect(() => assertReusableBlockOwnership({ scope: 'UNKNOWN', wardId: '11111111-1111-4111-8111-111111111111', stakeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerUserId: null } as never)).toThrow('Unsupported');
    expect(() => assertReusableBlockOwnership({ scope: 'STAKE', wardId: '11111111-1111-4111-8111-111111111111', stakeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerUserId: null } as never)).toThrow('ward-scoped');

    const snapshot: ReusableBlockSnapshot<'CUSTOM_TEXT'> = {
      version: 1,
      blockType: 'CUSTOM_TEXT',
      config: { text: 'Weekly welcome' },
      width: 'FULL',
      visibility: 'VISIBLE',
      printBehavior: 'PRINT_AND_DIGITAL',
      digitalBehavior: 'NORMAL'
    };
    expect(() => assertReusableBlockSnapshot(snapshot)).not.toThrow();
    expect(() => assertReusableBlockSnapshot({ ...snapshot, version: 0 })).toThrow('positive integer');
    expect(() => assertReusableBlockSnapshot({ ...snapshot, config: { text: '<script>' } })).toThrow('configuration');
    expect(() => assertReusableBlockSnapshot({ ...snapshot, printBehavior: 'INVALID' } as never)).toThrow('output behavior');
  });
});
