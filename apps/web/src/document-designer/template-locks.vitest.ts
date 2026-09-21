import { describe, expect, it } from 'vitest';
import { checkTemplateLocks, parseTemplateLockPolicy } from './template-locks';

const ids = {
  document: '00000000-0000-0000-0000-000000000001',
  page: '00000000-0000-0000-0000-000000000002',
  region: '00000000-0000-0000-0000-000000000003',
  block: '00000000-0000-0000-0000-000000000004',
  secondBlock: '00000000-0000-0000-0000-000000000005'
};

const policy = (mode: 'UNLOCKED' | 'STYLE_LOCKED' | 'STRUCTURE_LOCKED' | 'CONTENT_ONLY', extra: Record<string, unknown> = {}) => ({
  mode,
  lockedPageIds: [],
  lockedRegionIds: [],
  lockedBlockIds: [],
  lockedPropertyNames: [],
  protectedTheme: false,
  protectedVisibility: false,
  protectedOrder: false,
  ...extra
});

const base = {
  id: ids.document,
  paper: 'LETTER',
  orientation: 'PORTRAIT',
  theme: { fontFamily: 'sans', accentColor: '#000000' },
  pages: [{
    id: ids.page,
    regions: [{
      id: ids.region,
      ratio: 1,
      blocks: [
        { id: ids.block, width: 'FULL', content: { text: 'base' }, visibility: 'VISIBLE' },
        { id: ids.secondBlock, width: 'FULL', content: { text: 'second' }, visibility: 'VISIBLE' }
      ]
    }]
  }]
};

function resultFor(mode: Parameters<typeof policy>[0], proposed: unknown, extra?: Record<string, unknown>) {
  return checkTemplateLocks(base, proposed, policy(mode, extra));
}

describe('template lock policies', () => {
  it('rejects unknown and duplicate policy fields/ids', () => {
    expect(() => parseTemplateLockPolicy({ mode: 'UNLOCKED', unexpected: true })).toThrow();
    expect(() => parseTemplateLockPolicy({ mode: 'UNLOCKED', lockedBlockIds: [ids.block, ids.block] })).toThrow();
  });

  it('allows all non-identity changes in UNLOCKED mode but rejects forged IDs', () => {
    const changed = structuredClone(base) as typeof base;
    changed.theme.accentColor = '#ffffff';
    changed.pages[0].regions[0].blocks[0].content.text = 'changed';
    changed.pages[0].regions[0].blocks[0].id = '00000000-0000-0000-0000-000000000099';
    expect(resultFor('UNLOCKED', changed)).toMatchObject({ ok: false });
    const forgedResult = resultFor('UNLOCKED', { ...base, forged: [{ id: '00000000-0000-0000-0000-000000000099' }] });
    expect(forgedResult.ok).toBe(false);
    if (!forgedResult.ok) expect(forgedResult.violations.some((item) => item.code === 'FORGED_ID')).toBe(true);
    const valid = structuredClone(base) as typeof base;
    valid.theme.accentColor = '#ffffff';
    valid.pages[0].regions[0].blocks[0].content.text = 'changed';
    expect(resultFor('UNLOCKED', valid)).toMatchObject({ ok: true });
  });

  it('STYLE_LOCKED rejects style changes while allowing content changes', () => {
    const content = structuredClone(base) as typeof base;
    content.pages[0].regions[0].blocks[0].content.text = 'changed';
    expect(resultFor('STYLE_LOCKED', content)).toMatchObject({ ok: true });

    const style = structuredClone(base) as typeof base;
    style.theme.accentColor = '#ffffff';
    expect(resultFor('STYLE_LOCKED', style)).toMatchObject({ ok: false });
  });

  it('STRUCTURE_LOCKED rejects layout changes while allowing style and content changes', () => {
    const editable = structuredClone(base) as typeof base;
    editable.theme.accentColor = '#ffffff';
    editable.pages[0].regions[0].blocks[0].content.text = 'changed';
    expect(resultFor('STRUCTURE_LOCKED', editable)).toMatchObject({ ok: true });

    const structural = structuredClone(base) as typeof base;
    structural.pages[0].regions[0].ratio = 0.5;
    expect(resultFor('STRUCTURE_LOCKED', structural)).toMatchObject({ ok: false });
  });

  it('CONTENT_ONLY permits content changes and rejects style or structure changes', () => {
    const content = structuredClone(base) as typeof base;
    content.pages[0].regions[0].blocks[0].content.text = 'changed';
    expect(resultFor('CONTENT_ONLY', content)).toMatchObject({ ok: true });

    const style = structuredClone(base) as typeof base;
    style.theme.accentColor = '#ffffff';
    expect(resultFor('CONTENT_ONLY', style)).toMatchObject({ ok: false });

    const structural = structuredClone(base) as typeof base;
    structural.pages[0].regions[0].ratio = 0.5;
    expect(resultFor('CONTENT_ONLY', structural)).toMatchObject({ ok: false });
  });

  it('enforces explicit locked IDs, properties, theme, visibility, and order', () => {
    const changed = structuredClone(base) as typeof base;
    changed.pages[0].regions[0].blocks.reverse();
    changed.theme.accentColor = '#ffffff';
    changed.pages[0].regions[0].blocks[0].visibility = 'HIDDEN';
    changed.pages[0].regions[0].blocks[0].content.text = 'changed';
    const result = resultFor('UNLOCKED', changed, {
      lockedBlockIds: [ids.block],
      lockedPropertyNames: ['content'],
      protectedTheme: true,
      protectedVisibility: true,
      protectedOrder: true
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.map((item) => item.path)).toEqual(expect.arrayContaining(['theme', 'visibility', 'content']));

    const stable = structuredClone(base) as typeof base;
    stable.pages[0].regions[0].blocks[0].content.text = 'changed';
    expect(resultFor('UNLOCKED', stable, { lockedBlockIds: [ids.block] })).toMatchObject({ ok: false });
  });

  it('preserves stable IDs and rejects missing, duplicate, and forged IDs', () => {
    const missing = structuredClone(base) as typeof base;
    missing.pages[0].regions[0].blocks = [];
    expect(resultFor('UNLOCKED', missing)).toMatchObject({ ok: false });

    const duplicate = structuredClone(base) as typeof base;
    duplicate.pages[0].regions[0].blocks.push({ ...duplicate.pages[0].regions[0].blocks[0] });
    expect(resultFor('UNLOCKED', duplicate)).toMatchObject({ ok: false });

    const forged = structuredClone(base) as typeof base;
    forged.pages[0].regions[0].blocks.push({ id: '00000000-0000-0000-0000-000000000099', width: 'FULL', content: { text: 'x' }, visibility: 'VISIBLE' });
    expect(resultFor('UNLOCKED', forged)).toMatchObject({ ok: false });
  });
});
