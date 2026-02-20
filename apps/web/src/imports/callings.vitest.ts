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

it('normalizes birth dates like "26 May 1960" to "May 26"', () => {
  expect(
    parseCallingsPdfText(`
      Name  Gender  Age  Birth Date  Organization  Calling  Sustained  Set Apart
      Jane Doe  Female  35  26 May 1960  Relief Society  Relief Society President  Yes  No
    `)
  ).toEqual([
    {
      memberName: 'Jane Doe',
      birthday: 'May 26',
      organization: 'Relief Society',
      callingName: 'Relief Society President',
      sustained: true,
      setApart: false
    }
  ]);
});

it('normalizes member+birthday key when birthday includes year', () => {
  expect(makeMemberBirthdayKey('Jane Doe', '26 May 1960')).toBe('jane doe::may 26');
});
