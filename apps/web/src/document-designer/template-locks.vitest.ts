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

type LegacyTestLock = { level: 'NONE' | 'REGION' | 'BLOCK' | 'CONFIGURATION'; properties: string[] };
type TestBlock = {
  id: string;
  width: string;
  content: { text: string };
  visibility: string;
  styleOverrides?: { align: string };
  visibilityRule?: string;
  digitalOrder?: number;
  type?: string;
  data?: unknown;
  print?: unknown;
  digital?: unknown;
  lock?: LegacyTestLock;
};
type TestRegion = {
  id: string;
  ratio: number;
  gutter: number;
  columns: { count: number; ratio: string; gutter: number; blockIds: string[][] };
  blocks: TestBlock[];
};
type TestPage = { id: string; regions: TestRegion[]; lock?: LegacyTestLock };
type TestLayout = { id: string; paper: string; orientation: string; theme: Record<string, string>; pages: TestPage[] };

const base: TestLayout = {
  id: ids.document,
  paper: 'LETTER',
  orientation: 'PORTRAIT',
  theme: { fontFamily: 'sans', accentColor: '#000000' },
  pages: [{
    id: ids.page,
    regions: [{
      id: ids.region,
      ratio: 1,
      gutter: 0,
      columns: { count: 1, ratio: '1/1', gutter: 0, blockIds: [[ids.block, ids.secondBlock]] },
      blocks: [
        { id: ids.block, width: 'FULL', content: { text: 'base' }, visibility: 'VISIBLE', styleOverrides: { align: 'LEFT' }, visibilityRule: 'ALWAYS', digitalOrder: 1 },
        { id: ids.secondBlock, width: 'FULL', content: { text: 'second' }, visibility: 'VISIBLE', styleOverrides: { align: 'LEFT' }, visibilityRule: 'ALWAYS', digitalOrder: 2 }
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

  it('accepts legacy empty and document-level lock shapes as compatible policies', () => {
    expect(parseTemplateLockPolicy({}).mode).toBe('UNLOCKED');
    expect(parseTemplateLockPolicy({ level: 'BLOCK', properties: ['CONTENT'] }).lockedPropertyNames).toEqual(['CONTENT']);
    expect(checkTemplateLocks(base, base, {})).toMatchObject({ ok: true });
  });

  it('enforces legacy CONTENT and SIZE locks instead of treating uppercase names as inert', () => {
    const contentChanged = structuredClone(base) as typeof base;
    contentChanged.pages[0].regions[0].blocks[0].content.text = 'changed';
    expect(checkTemplateLocks(base, contentChanged, { level: 'BLOCK', properties: ['CONTENT'] })).toMatchObject({ ok: false });

    const sizeChanged = structuredClone(base) as typeof base;
    sizeChanged.pages[0].regions[0].blocks[0].width = 'HALF';
    expect(checkTemplateLocks(base, sizeChanged, { level: 'BLOCK', properties: ['SIZE'] })).toMatchObject({ ok: false });

    const regionSizeChanged = structuredClone(base) as typeof base;
    regionSizeChanged.pages[0].regions[0].ratio = 0.5;
    expect(checkTemplateLocks(base, regionSizeChanged, { level: 'REGION', properties: ['SIZE'] })).toMatchObject({ ok: false });
  });

  it('enforces every legacy property on advanced fields', () => {
    const cases = [
      ['CONTENT', (next: typeof base) => { next.pages[0].regions[0].blocks[0].type = 'ANNOUNCEMENT'; }],
      ['CONTENT', (next: typeof base) => { next.pages[0].regions[0].blocks[0].data = { key: 'changed' }; }],
      ['CONTENT', (next: typeof base) => { next.pages[0].regions[0].blocks[0].print = { mode: 'changed' }; }],
      ['CONTENT', (next: typeof base) => { next.pages[0].regions[0].blocks[0].digital = { mode: 'changed' }; }],
      ['STYLE', (next: typeof base) => { next.pages[0].regions[0].blocks[0].styleOverrides = { align: 'RIGHT' }; }],
      ['VISIBILITY', (next: typeof base) => { next.pages[0].regions[0].blocks[0].visibilityRule = 'WHEN_PUBLIC'; }],
      ['SIZE', (next: typeof base) => { next.pages[0].regions[0].columns.count = 2; }],
      ['POSITION', (next: typeof base) => { next.pages[0].regions[0].blocks[0].digitalOrder = 9; }]
    ] as const;
    for (const [property, mutate] of cases) {
      const changed = structuredClone(base) as typeof base;
      mutate(changed);
      expect(checkTemplateLocks(base, changed, { level: 'BLOCK', properties: [property] })).toMatchObject({ ok: false });
    }
  });

  it('enforces nested page and block legacy locks', () => {
    const locked = structuredClone(base) as typeof base;
    locked.pages[0].lock = { level: 'REGION', properties: ['SIZE'] };
    locked.pages[0].regions[0].blocks[0].lock = { level: 'BLOCK', properties: ['CONTENT'] };
    const changed = structuredClone(locked) as typeof base;
    changed.pages[0].regions[0].ratio = 0.5;
    changed.pages[0].regions[0].blocks[0].data = { key: 'changed' };
    changed.pages[0].regions[0].blocks[0].print = { mode: 'changed' };
    changed.pages[0].regions[0].blocks[0].digital = { mode: 'changed' };
    expect(checkTemplateLocks(locked, changed, {})).toMatchObject({ ok: false });
  });

  it('rejects malformed legacy lock properties and invalid level combinations', () => {
    expect(() => parseTemplateLockPolicy({ level: 'REGION', properties: ['CONTENT'] })).toThrow();
    expect(() => parseTemplateLockPolicy({ level: 'BLOCK', properties: ['UNKNOWN'] })).toThrow();
    expect(checkTemplateLocks(base, base, { level: 'BLOCK', properties: ['UNKNOWN'] })).toMatchObject({ ok: false });
  });

  it('rejects advanced structural fields under STRUCTURE_LOCKED', () => {
    const permutations = [
      (changed: typeof base) => { changed.pages[0].regions[0].columns.count = 2; },
      (changed: typeof base) => { changed.pages[0].regions[0].blocks[0].digitalOrder = 9; },
      (changed: typeof base) => { changed.pages[0].regions[0].columns.blockIds = [[ids.secondBlock, ids.block]]; },
      (changed: typeof base) => { changed.pages[0].regions[0].columns.blockIds = [[ids.block], [ids.secondBlock]]; },
      (changed: typeof base) => { changed.pages[0].regions[0].columns.blockIds = [[ids.block]]; }
    ];
    for (const mutate of permutations) {
      const changed = structuredClone(base) as typeof base;
      mutate(changed);
      expect(resultFor('STRUCTURE_LOCKED', changed)).toMatchObject({ ok: false });
    }
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
