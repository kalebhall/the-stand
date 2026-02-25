import { describe, expect, it } from 'vitest';

import { parseCallingsFromTableForTest, parseMembersFromTableForTest } from './lcr';

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
