import { describe, expect, it } from 'vitest';

import { STAND_TEMPLATE_METADATA, templateClassificationLabel } from './template-metadata';

describe('stand template metadata', () => {
  it('classifies every editable template', () => {
    expect(Object.keys(STAND_TEMPLATE_METADATA)).toHaveLength(7);
    expect(STAND_TEMPLATE_METADATA.welcome.classification).toBe('WARD_PROMPT');
    expect(STAND_TEMPLATE_METADATA.priesthoodOrdination.sourceUrl).toContain('general-handbook/18-');
  });

  it('labels ward prompts clearly', () => {
    expect(templateClassificationLabel('WARD_PROMPT')).toBe('Editable ward prompt');
    expect(templateClassificationLabel('HANDBOOK_REQUIRED_ELEMENTS')).toBe('Handbook required elements');
  });
});