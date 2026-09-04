import { describe, expect, it } from 'vitest';

import { DEFAULT_STAND_BUSINESS_TEMPLATES } from './default-template';

describe('membership and ordinance stand templates', () => {
  it('provides templates for every supported membership and ordinance action', () => {
    expect(Object.keys(DEFAULT_STAND_BUSINESS_TEMPLATES)).toEqual([
      'WELCOME_NEW_MEMBER',
      'BABY_BLESSING',
      'PRIESTHOOD_ORDINATION',
      'PRIESTHOOD_ADVANCEMENT'
    ]);
    expect(Object.values(DEFAULT_STAND_BUSINESS_TEMPLATES).every((template) => template.includes('{memberName}'))).toBe(true);
  });
});
