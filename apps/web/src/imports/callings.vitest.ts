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

  it('parses single-space extracted rows with full-word gender tokens', () => {
    expect(
      parseCallingsPdfText(`
        Name Gender Age Birth Date Organization Calling Sustained Set Apart
        Doe, Jane Female 35 26 May 1960 Relief Society Relief Society President Yes No
      `)
    ).toEqual([
      {
        memberName: 'Doe, Jane',
        birthday: 'May 26',
        organization: 'Relief Society',
        callingName: 'Relief Society President',
        sustained: true,
        setApart: false
      }
    ]);
  });

  it('parses single-space rows without header using M/F tokens', () => {
    const result = parseCallingsPdfText('Acosta, Frank M 65 26 May 1960 Elders Quorum Elders Quorum Secretary 9 Mar 2025');

    expect(result).toEqual([
      {
        memberName: 'Acosta, Frank',
        birthday: 'May 26',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum Secretary',
        sustained: true,
        setApart: false
      }
    ]);
  });

  it('parses compact pdf rows with wrapped calling lines and separate set-apart token', () => {
    const result = parseCallingsPdfText(`
      NameGenderAgeBirth DateOrganizationCallingSustainedSet Apart
      Acosta, FrankM6526 May 1960Elders QuorumElders Quorum Secretary9 Mar 2025
      ✔
      Amber, TimM6723 Nov 1958Elders QuorumElders Quorum Activity
      Committee Member
    `);

    expect(result).toEqual([
      {
        memberName: 'Acosta, Frank',
        birthday: 'May 26',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum Secretary',
        sustained: true,
        setApart: true
      },
      {
        memberName: 'Amber, Tim',
        birthday: 'Nov 23',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum Activity Committee Member',
        sustained: false,
        setApart: false
      }
    ]);
  });
});
