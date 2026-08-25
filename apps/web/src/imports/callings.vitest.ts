import { describe, expect, it } from 'vitest';

import { makeMemberBirthdayKey, parseCallingsPdfText, parseCallingsTsvText } from './callings';

describe('calling PDF import parsing', () => {
  it('parses rows and skips report headers', () => {
    expect(
      parseCallingsPdfText(`
        Alpine 1st Ward Alpine Utah North Stake Members with Callings
        Name  Gender  Age  Birth Date  Organization  Calling  Sustained  Set Apart
        Jane Doe  Female  35  15 Jan 1960  Relief Society  Relief Society President  Yes  No
        John Smith  Male  42  3 Mar 1982  Elders Quorum  Elders Quorum President  True  True
        Count: 2
      `)
    ).toEqual([
      {
        memberName: 'Jane Doe',
        birthday: 'Jan 15',
        organization: 'Relief Society',
        callingName: 'Relief Society President',
        sustainedDate: null,
        setApart: false
      },
      {
        memberName: 'John Smith',
        birthday: 'Mar 3',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum President',
        sustainedDate: null,
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
        sustainedDate: null,
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
        sustainedDate: null,
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
        sustainedDate: '2025-03-09',
        setApart: false
      }
    ]);
  });

  it('parses compact pdf rows with wrapped calling lines and separate set-apart token', () => {
    const result = parseCallingsPdfText(`
      NameGenderAgeBirth DateOrganizationCallingSustainedSet Apart
      Acosta, FrankM6526 May 1960Elders QuorumElders Quorum Secretary9 Mar 2025
      \u2714
      Amber, TimM6723 Nov 1958Elders QuorumElders Quorum Activity
      Committee Member
    `);

    expect(result).toEqual([
      {
        memberName: 'Acosta, Frank',
        birthday: 'May 26',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum Secretary',
        sustainedDate: '2025-03-09',
        setApart: true
      },
      {
        memberName: 'Amber, Tim',
        birthday: 'Nov 23',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum Activity Committee Member',
        sustainedDate: null,
        setApart: false
      }
    ]);
  });

  it('parses row with sustained date on a separate line followed by set-apart token', () => {
    // Simulates the PDF pattern where sustained date wraps to its own line
    const result = parseCallingsPdfText(
      'Acosta, Frank M 65 26 May 1960 Elders Quorum Elders Quorum Secretary\n9 Mar 2025\n\u2714'
    );
    expect(result).toEqual([
      {
        memberName: 'Acosta, Frank',
        birthday: 'May 26',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum Secretary',
        sustainedDate: '2025-03-09',
        setApart: true
      }
    ]);
  });

  it('parses row with no sustained date and no set-apart (both optional/missing)', () => {
    const result = parseCallingsPdfText(
      'August, Agnes Alana F 76 9 May 1949 Relief Society Relief Society Activity Coordinator'
    );
    expect(result).toEqual([
      {
        memberName: 'August, Agnes Alana',
        birthday: 'May 9',
        organization: 'Relief Society',
        callingName: 'Relief Society Activity Coordinator',
        sustainedDate: null,
        setApart: false
      }
    ]);
  });

  it('parses row whose name contains a Unicode right-single-quote (Ra\u2019sean)', () => {
    const result = parseCallingsPdfText(
      'Capers, Ra\u2019sean Emmanuel M 15 24 Nov 2010 Aaronic Priesthood Quorums Teachers Quorum Secretary'
    );
    expect(result).toEqual([
      {
        memberName: 'Capers, Ra\u2019sean Emmanuel',
        birthday: 'Nov 24',
        organization: 'Aaronic Priesthood Quorums',
        callingName: 'Teachers Quorum Secretary',
        sustainedDate: null,
        setApart: false
      }
    ]);
  });
});

// ---------------------------------------------------------------------------
// TSV parser tests — LCR "Members with Callings" copy-paste format
// ---------------------------------------------------------------------------

describe('parseCallingsTsvText — LCR TSV format', () => {
  const TSV_HEADER =
    'Name\tGender\tAge\tBirth Date\tPhone Number\tOrganizations\tCalling\tSustained\tSet Apart';

  it('parses a single TSV row with a sustained date and no set-apart', () => {
    const input = [
      TSV_HEADER,
      'Acosta, Frank\tM\t66\t26 May 1960\t(702) 236-5833\tElders Quorum\tElders Quorum Secretary\t23 Feb 2025\t'
    ].join('\n');

    expect(parseCallingsTsvText(input)).toEqual([
      {
        memberName: 'Acosta, Frank',
        birthday: 'May 26',
        organization: 'Elders Quorum',
        callingName: 'Elders Quorum Secretary',
        sustainedDate: '2025-02-23',
        setApart: false
      }
    ]);
  });

  it('deduplicates members with multiple callings (keeps all unique rows)', () => {
    const input = [
      TSV_HEADER,
      'August, Agnes Alana\tF\t77\t9 May 1949\t(702) 272-9433\tOther Callings\tMusic Leader\t2 Mar 2025\t',
      'August, Agnes Alana\tF\t77\t9 May 1949\t(702) 272-9433\tRelief Society\tRelief Society Activity Coordinator\t8 Feb 2026\t',
      'August, Agnes Alana\tF\t77\t9 May 1949\t(702) 272-9433\tTemple Workers\tTemple Worker\t17 Jun 2026\t'
    ].join('\n');

    const result = parseCallingsTsvText(input);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.callingName)).toEqual([
      'Music Leader',
      'Relief Society Activity Coordinator',
      'Temple Worker'
    ]);
  });

  it('routes to TSV parser via parseCallingsPdfText when input contains tabs', () => {
    const input = [
      TSV_HEADER,
      'Hall, Kaleb\tM\t46\t1 Jan 1980\t(702) 249-0875\tBishopric\tBishopric First Counselor\t3 Nov 2024\t'
    ].join('\n');

    const result = parseCallingsPdfText(input);
    expect(result).toEqual([
      {
        memberName: 'Hall, Kaleb',
        birthday: 'Jan 1',
        organization: 'Bishopric',
        callingName: 'Bishopric First Counselor',
        sustainedDate: '2024-11-03',
        setApart: false
      }
    ]);
  });

  it('skips rows with no tab and Count: footer lines', () => {
    const input = [
      TSV_HEADER,
      'Acosta, Frank\tM\t66\t26 May 1960\t(702) 236-5833\tElders Quorum\tElders Quorum Secretary\t23 Feb 2025\t',
      'Count: 1'
    ].join('\n');

    expect(parseCallingsTsvText(input)).toHaveLength(1);
  });

  it('handles empty phone number column', () => {
    const input = [
      TSV_HEADER,
      'Bartholomew, Aria Rosalie\tF\t13\t26 Jun 2013\t\tYoung Women\tBuilders of Faith Class President\t11 Jan 2026\t'
    ].join('\n');

    expect(parseCallingsTsvText(input)).toEqual([
      {
        memberName: 'Bartholomew, Aria Rosalie',
        birthday: 'Jun 26',
        organization: 'Young Women',
        callingName: 'Builders of Faith Class President',
        sustainedDate: '2026-01-11',
        setApart: false
      }
    ]);
  });
});
