import { describe, expect, it } from 'vitest';

import { validateProtectedProgramOrder } from './program-item-rules';

const normal = [
  { itemType: 'INTRODUCTION', sequence: 1 },
  { itemType: 'ANNOUNCEMENT', sequence: 2 },
  { itemType: 'SPEAKER', sequence: 3 }
];

describe('protected program order', () => {
  it('accepts normal ward order and conference order', () => {
    expect(validateProtectedProgramOrder('SACRAMENT', normal)).toBeNull();
    expect(validateProtectedProgramOrder('GENERAL_CONFERENCE', [{ itemType: 'ANNOUNCEMENT', sequence: 1 }])).toBeNull();
  });

  it('protects Introduction and Announcement positions', () => {
    expect(
      validateProtectedProgramOrder('SACRAMENT', [
        { itemType: 'ANNOUNCEMENT', sequence: 1 },
        { itemType: 'INTRODUCTION', sequence: 2 }
      ])?.reason
    ).toBe('INTRODUCTION_POSITION');
    expect(
      validateProtectedProgramOrder('GENERAL_CONFERENCE', [
        { itemType: 'INTRODUCTION', sequence: 1 },
        { itemType: 'ANNOUNCEMENT', sequence: 2 }
      ])?.reason
    ).toBe('CONFERENCE_INTRODUCTION');
    expect(validateProtectedProgramOrder('SACRAMENT', [{ itemType: 'INTRODUCTION', sequence: 1 }])?.reason).toBe('MISSING_ANNOUNCEMENT');
  });

  it('preserves contiguous legacy Introduction role rows', () => {
    expect(
      validateProtectedProgramOrder('SACRAMENT', [
        { itemType: 'PRESIDING', sequence: 1 },
        { itemType: 'CONDUCTING', sequence: 2 },
        { itemType: 'ORGANIST_PIANIST', sequence: 3 },
        { itemType: 'CHORISTER', sequence: 4 },
        { itemType: 'ANNOUNCEMENT', sequence: 5 }
      ])
    ).toBeNull();
  });

  it('rejects mixed or out-of-order legacy Introduction rows', () => {
    expect(
      validateProtectedProgramOrder('SACRAMENT', [
        { itemType: 'INTRODUCTION', sequence: 1 },
        { itemType: 'PRESIDING', sequence: 2 },
        { itemType: 'ANNOUNCEMENT', sequence: 3 }
      ])?.reason
    ).toBe('INTRODUCTION_POSITION');
    expect(
      validateProtectedProgramOrder('SACRAMENT', [
        { itemType: 'PRESIDING', sequence: 1 },
        { itemType: 'CHORISTER', sequence: 2 },
        { itemType: 'CONDUCTING', sequence: 3 },
        { itemType: 'ANNOUNCEMENT', sequence: 4 }
      ])?.reason
    ).toBe('INTRODUCTION_POSITION');
    expect(
      validateProtectedProgramOrder('SACRAMENT', [
        { itemType: 'INTRODUCTION', sequence: 1 },
        { itemType: 'INTRODUCTION', sequence: 2 },
        { itemType: 'ANNOUNCEMENT', sequence: 3 }
      ])?.reason
    ).toBe('INTRODUCTION_POSITION');
  });
});
