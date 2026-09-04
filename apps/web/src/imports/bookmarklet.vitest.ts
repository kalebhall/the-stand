import { describe, expect, it } from 'vitest';

import { getLcrBookmarkletHref, LCR_DOM_EXTRACTOR_SCRIPT } from './bookmarklet';

describe('LCR bookmarklet', () => {
  it('produces an encoded javascript bookmarklet', () => {
    const href = getLcrBookmarkletHref();
    expect(href.startsWith('javascript:')).toBe(true);
    expect(decodeURIComponent(href.slice('javascript:'.length))).toBe(LCR_DOM_EXTRACTOR_SCRIPT);
  });

  it('supports Eden tables, legacy grids, and SVG set-apart detection', () => {
    expect(LCR_DOM_EXTRACTOR_SCRIPT).toContain('.eden-table-card-view__cloned-column-header');
    expect(LCR_DOM_EXTRACTOR_SCRIPT).toContain('[role="grid"]');
    expect(LCR_DOM_EXTRACTOR_SCRIPT).toContain('svg.eden-icon');
    expect(LCR_DOM_EXTRACTOR_SCRIPT).toContain("acc.push(svgEl ? 'yes' : 'no')");
    expect(LCR_DOM_EXTRACTOR_SCRIPT).toContain('navigator.clipboard.writeText');
    expect(LCR_DOM_EXTRACTOR_SCRIPT).toContain('prompt(');
  });
});
