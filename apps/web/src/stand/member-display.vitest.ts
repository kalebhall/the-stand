import { describe, expect, it } from 'vitest';

import { formatAtStandMemberName } from './member-display';

describe('formatAtStandMemberName', () => {
  it('uses gender, first name, and last name only', () => {
    expect(formatAtStandMemberName('Hall, Crystal Jane', { firstName: 'Crystal Jane', lastName: 'Hall', gender: 'F' })).toBe(
      'Sister Crystal Hall'
    );
    expect(formatAtStandMemberName('Hall, Kaleb James', { firstName: 'Kaleb James', lastName: 'Hall', gender: 'M' })).toBe(
      'Brother Kaleb Hall'
    );
  });

  it('uses Bishop and President for organization callings', () => {
    expect(formatAtStandMemberName('Hall, Kaleb', { firstName: 'Kaleb', lastName: 'Hall', gender: 'M' }, 'Bishop')).toBe(
      'Bishop Kaleb Hall'
    );
    expect(
      formatAtStandMemberName('Hall, Crystal', { firstName: 'Crystal', lastName: 'Hall', gender: 'F' }, 'Relief Society President')
    ).toBe('President Crystal Hall');
  });
});
