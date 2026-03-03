import { describe, expect, it } from 'vitest';

import { formatLaunchErrorForTest, parseCallingsFromTableForTest, parseMembersFromTableForTest } from './lcr';

describe('lcr table parsing', () => {
  it('parses member rows', () => {
    const members = parseMembersFromTableForTest({
      headers: ['Name', 'Email', 'Phone', 'Age', 'Birth Date', 'Gender'],
      rows: [
        ['Jane Doe', 'jane@example.com', '801-555-0101', '35', 'Jan 15', 'Female'],
        ['John Doe', '', '', '', '', 'Male']
      ]
    });

    expect(members).toEqual([
      {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '801-555-0101',
        age: 35,
        birthday: 'Jan 15',
        gender: 'Female'
      },
      {
        fullName: 'John Doe',
        email: null,
        phone: null,
        age: null,
        birthday: null,
        gender: 'Male'
      }
    ]);
  });

  it('parses member rows with PDF-style headers (E-mail, Phone Number)', () => {
    const members = parseMembersFromTableForTest({
      headers: ['Name', 'Gender', 'Age', 'Birth Date', 'Phone Number', 'E-mail'],
      rows: [
        ['Doe, Jane Marie', 'F', '35', '15 Jan 1991', '801-555-0101', 'jane@example.com'],
        ['Smith, John David', 'M', '42', '20 Feb 1984', '', '']
      ]
    });

    expect(members).toEqual([
      {
        fullName: 'Doe, Jane Marie',
        email: 'jane@example.com',
        phone: '801-555-0101',
        age: 35,
        birthday: '15 Jan 1991',
        gender: 'F'
      },
      {
        fullName: 'Smith, John David',
        email: null,
        phone: null,
        age: 42,
        birthday: '20 Feb 1984',
        gender: 'M'
      }
    ]);
  });

  it('parses calling rows', () => {
    const callings = parseCallingsFromTableForTest({
      headers: ['Name', 'Birth Date', 'Organization', 'Calling', 'Sustained', 'Set Apart'],
      rows: [
        ['Jane Doe', 'Jan 15', 'Primary', 'Teacher', 'Yes', 'No'],
        ['John Doe', 'Feb 20', 'Bishopric', 'Executive Secretary', 'No', 'Yes']
      ]
    });

    expect(callings).toEqual([
      {
        memberName: 'Jane Doe',
        birthday: 'Jan 15',
        organization: 'Primary',
        callingName: 'Teacher',
        sustainedDate: null,
        setApart: false
      },
      {
        memberName: 'John Doe',
        birthday: 'Feb 20',
        organization: 'Bishopric',
        callingName: 'Executive Secretary',
        sustainedDate: null,
        setApart: true
      }
    ]);
  });

  it('parses calling rows with PDF-style format', () => {
    const callings = parseCallingsFromTableForTest({
      headers: ['Name', 'Gender', 'Age', 'Birth Date', 'Organization', 'Calling', 'Sustained', 'Set Apart'],
      rows: [
        ['Hall, Crystal Jane', 'F', '45', '15 May 1980', 'Relief Society', 'Relief Society President', '16 Feb 2025', '✔'],
        ['Hall, Kaleb', 'M', '46', '1 Jan 1980', 'Bishopric', 'Bishopric First Counselor', '10 Nov 2024', '✔']
      ]
    });

    expect(callings).toEqual([
      {
        memberName: 'Hall, Crystal Jane',
        birthday: '15 May 1980',
        organization: 'Relief Society',
        callingName: 'Relief Society President',
        sustainedDate: '2025-02-16',
        setApart: true
      },
      {
        memberName: 'Hall, Kaleb',
        birthday: '1 Jan 1980',
        organization: 'Bishopric',
        callingName: 'Bishopric First Counselor',
        sustainedDate: '2024-11-10',
        setApart: true
      }
    ]);
  });
});

describe('lcr launch error formatting', () => {
  it('returns install guidance for missing shared libs', () => {
    const formatted = formatLaunchErrorForTest(
      new Error('browserType.launch: Target page, context or browser has been closed ... error while loading shared libraries: libnspr4.so')
    );

    expect(formatted).toContain('Install Playwright system dependencies');
    expect(formatted).toContain('install-deps chromium');
  });

  it('returns install guidance for missing browser executable', () => {
    const formatted = formatLaunchErrorForTest(new Error("browserType.launch: Executable doesn't exist"));
    expect(formatted).toContain('playwright install chromium');
  });
});
