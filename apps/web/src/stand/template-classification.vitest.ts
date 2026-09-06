import { describe, expect, it } from 'vitest';

import { TEMPLATE_CLASSIFICATIONS } from './template-classification';

describe('template classifications', () => {
  it('classifies every editable template with official source link', () => {
    expect(Object.values(TEMPLATE_CLASSIFICATIONS)).toHaveLength(8);
    for (const classification of Object.values(TEMPLATE_CLASSIFICATIONS)) {
      expect(classification.label).toMatch(/Ward prompt|Sample sustaining wording|Handbook instruction/);
      expect(classification.sourceUrl).toMatch(/^https:\/\//);
      expect(classification.description).not.toContain('official script');
    }
  });

  it('keeps ordinance completion separate from meeting prompts', () => {
    expect(TEMPLATE_CLASSIFICATIONS.babyBlessingTemplate.description).toContain('not a fixed ordinance script');
    expect(TEMPLATE_CLASSIFICATIONS.priesthoodOrdinationTemplate.description).toContain('completion remains separate');
  });
});
