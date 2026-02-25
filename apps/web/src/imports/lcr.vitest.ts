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
        sustained: true,
        setApart: false
      },
      {
        memberName: 'John Doe',
        birthday: 'Feb 20',
        organization: 'Bishopric',
        callingName: 'Executive Secretary',
        sustained: false,
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
