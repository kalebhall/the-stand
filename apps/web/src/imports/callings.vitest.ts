import { describe, expect, it } from 'vitest';

import { makeMemberBirthdayKey, parseCallingsPdfText } from './callings';

describe('calling PDF import parsing', () => {
  it('parses rows and skips report headers', () => {
    expect(
      parseCallingsPdfText(`
        Alpine 1st Ward Alpine Utah North Stake Members with Callings
        Name  Gender  Age  Birth Date  Organization  Calling  Sustained  Set Apart
        Jane Doe  Female  35  Jan 15  Relief Society  Relief Society President  Yes  No
        John Smith  Male  42  Mar 3  Elders Quorum  Elders Quorum President  True  True
        Count: 2
      `)
    ).toEqual([
      {
        memberName: 'Jane Doe',
        birthday: 'Jan 15',
        organization: 'Relief Society',
        callingName: 'Relief Society President',
        sustained: true,
        setApart: false
      },
      {
        memberName: 'John Smith',
        birthday: 'Mar 3',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum President',
        sustained: true,
        setApart: true
      }
    ]);
  });

  it('dedupes by name, birthday, and calling with last row winning', () => {
    expect(
      parseCallingsPdfText(`
        Name  Gender  Age  Birth Date  Organization  Calling  Sustained  Set Apart
        Jane Doe  Female  35  Jan 15  Relief Society  Relief Society President  No  No
        Jane Doe  Female  35  Jan 15  Relief Society  Relief Society President  Yes  Yes
      `)
    ).toEqual([
      {
        memberName: 'Jane Doe',
        birthday: 'Jan 15',
        organization: 'Relief Society',
        callingName: 'Relief Society President',
        sustained: true,
        setApart: true
      }
    ]);
  });

  it('normalizes member+birthday key for linking', () => {
    expect(makeMemberBirthdayKey('  Jane   Doe ', ' Jan   15 ')).toBe('jane doe::jan 15');
  });
});
