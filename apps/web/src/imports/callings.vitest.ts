import { describe, expect, it } from 'vitest';

import { parseCallingsText, toPlainText } from './callings';

describe('calling import parsing', () => {
  it('normalizes html to plain text', () => {
    expect(toPlainText('<p>Release: Jane Doe, Relief Society President</p><p>John Doe | Elders Quorum President</p>')).toBe(
      'Release: Jane Doe, Relief Society President\nJohn Doe | Elders Quorum President'
    );
  });

  it('parses callings with release indicators and spacing variants', () => {
    expect(
      parseCallingsText(`
      Sustained: John Doe, Elders Quorum President
      Release - Jane Doe | Relief Society President
      Josh Smith\tExecutive Secretary
      `)
    ).toEqual([
      { memberName: 'John Doe', callingName: 'Elders Quorum President', isRelease: false },
      { memberName: 'Jane Doe', callingName: 'Relief Society President', isRelease: true },
      { memberName: 'Josh Smith', callingName: 'Executive Secretary', isRelease: false }
    ]);
  });

  it('dedupes by member and calling with last line winning', () => {
    expect(
      parseCallingsText(`
      John Doe as Ward Clerk
      Release: John Doe as Ward Clerk
      `)
    ).toEqual([{ memberName: 'John Doe', callingName: 'Ward Clerk', isRelease: true }]);
  });
});
