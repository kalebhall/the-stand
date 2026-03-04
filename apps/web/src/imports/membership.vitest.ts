import { describe, expect, it } from 'vitest';

import { parseMembershipText, toPlainText } from './membership';

describe('membership import parsing', () => {
  it('strips html to plain text', () => {
    const parsed = toPlainText('<p>Jane Doe, jane@example.com, 801-555-0101</p><p>John Doe</p>');

    expect(parsed).toBe('Jane Doe, jane@example.com, 801-555-0101\nJohn Doe');
  });

  it('parses rows and tolerates malformed spacing (legacy mode without header)', () => {
    const result = parseMembershipText(`
      Jane Doe  ,  jane@example.com   , 801-555-0101
      John Doe|801-555-4444
      Sister Example\tjane2@example.com
    `);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: '801-555-0101', age: null, birthday: null, gender: null },
      { fullName: 'John Doe', email: null, phone: '801-555-4444', age: null, birthday: null, gender: null },
      { fullName: 'Sister Example', email: 'jane2@example.com', phone: null, age: null, birthday: null, gender: null }
    ]);
  });

  it('deduplicates by name and preserves newest provided fields', () => {
    const result = parseMembershipText(`
      Jane Doe
      Jane Doe, jane@example.com
      Jane Doe, 801-555-0101
    `);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: '801-555-0101', age: null, birthday: null, gender: null }
    ]);
  });

  it('detects header row and maps fields by column name', () => {
    const result = parseMembershipText(`
      Name, Email, Phone, Age, Birthday, Gender
      Jane Doe, jane@example.com, 801-555-0101, 35, Jan 15, Female
      John Doe, john@example.com, 801-555-4444, 42, Mar 22, Male
    `);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: '801-555-0101', age: 35, birthday: 'Jan 15', gender: 'Female' },
      { fullName: 'John Doe', email: 'john@example.com', phone: '801-555-4444', age: 42, birthday: 'Mar 22', gender: 'Male' }
    ]);
  });

  it('handles header with different column order', () => {
    const result = parseMembershipText(`
      Email, Full Name, Age, Gender, Phone
      jane@example.com, Jane Doe, 28, Female, 801-555-0101
    `);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: '801-555-0101', age: 28, birthday: null, gender: 'Female' }
    ]);
  });

  it('preserves commas inside tab-delimited values', () => {
    const result = parseMembershipText(`Name\tEmail\tBirthday
Jane Doe\tjane@example.com\tFebruary 14, 1990`);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: null, age: null, birthday: 'February 14, 1990', gender: null }
    ]);
  });

  it('handles tab-separated header rows', () => {
    const result = parseMembershipText('Name\tEmail\tAge\tBirthday\nJane Doe\tjane@example.com\t30\tFeb 14');

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: null, age: 30, birthday: 'Feb 14', gender: null }
    ]);
  });

  it('handles pipe-separated header rows', () => {
    const result = parseMembershipText('Name | Phone | Gender\nJane Doe | 801-555-0101 | Female');

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: null, phone: '801-555-0101', age: null, birthday: null, gender: 'Female' }
    ]);
  });

  it('handles header variations like Member Name, DOB, Sex', () => {
    const result = parseMembershipText(`
      Member Name, E-mail, DOB, Sex
      Jane Doe, jane@example.com, 1990-01-15, F
    `);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: null, age: null, birthday: '1990-01-15', gender: 'F' }
    ]);
  });

  it('skips header row but does not skip data when no header detected', () => {
    const result = parseMembershipText(`
      Jane Doe, jane@example.com
      John Doe, john@example.com
    `);

    expect(result).toHaveLength(2);
    expect(result[0].fullName).toBe('Jane Doe');
    expect(result[1].fullName).toBe('John Doe');
  });

  it('deduplicates with header-based parsing and merges fields', () => {
    const result = parseMembershipText(`
      Name, Email, Age
      Jane Doe, jane@example.com, 35
      Jane Doe, , 36
    `);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: null, age: 36, birthday: null, gender: null }
    ]);
  });

  it('parses single-line PDF table rows (name + gender + age + birthday)', () => {
    const result = parseMembershipText(`
      Name Gender Age Birth Date Phone Number E-mail
      Doe, Jane Female 35 26 May 1990 801-555-0101 jane@example.com
    `);

    expect(result).toEqual([
      {
        fullName: 'Doe, Jane',
        email: 'jane@example.com',
        phone: '801-555-0101',
        age: null,
        birthday: 'May 26 1990',
        gender: 'F'
      }
    ]);
  });

  it('ignores repeated page headers/footers in membership PDF text', () => {
    const result = parseMembershipText(`
      NameGenderAgeBirth DatePhone NumberE-mail
      Doe, Jane Female 35 26 May 1990 801-555-0101 jane@example.com
      For Church Use Only
      © 2025 by Intellectual Reserve, Inc. All rights reserved.
      NameGenderAgeBirth DatePhone NumberE-mail
      Smith, John Male 42 20 Feb 1983 801-555-4444 john@example.com
      Page 2
    `);

    expect(result).toEqual([
      {
        fullName: 'Doe, Jane',
        email: 'jane@example.com',
        phone: '801-555-0101',
        age: null,
        birthday: 'May 26 1990',
        gender: 'F'
      },
      {
        fullName: 'Smith, John',
        email: 'john@example.com',
        phone: '801-555-4444',
        age: null,
        birthday: 'Feb 20 1983',
        gender: 'M'
      }
    ]);
  });

  it('parses compact membership rows with glued columns', () => {
    const result = parseMembershipText(`
      NameGenderAgeBirth DatePhone NumberE-mail
      Acosta, FrankM6526 May 1960801-555-0000frank@example.com
      Amber, TimM6723 Nov 1958
    `);

    expect(result).toEqual([
      {
        fullName: 'Acosta, Frank',
        email: 'frank@example.com',
        phone: '801-555-0000',
        age: null,
        birthday: 'May 26 1960',
        gender: 'M'
      },
      {
        fullName: 'Amber, Tim',
        email: null,
        phone: null,
        age: null,
        birthday: 'Nov 23 1958',
        gender: 'M'
      }
    ]);
  });

  it('handles dd-Mmm-yyyy birthdays and merged phone+email tails', () => {
    const result = parseMembershipText(`
      NameGenderAgeBirth DatePhone NumberE-mail
      Clark, EmmaF3426-May-1991801-555-1212emma@example.com
    `);

    expect(result).toEqual([
      {
        fullName: 'Clark, Emma',
        email: 'emma@example.com',
        phone: '801-555-1212',
        age: null,
        birthday: 'May 26 1991',
        gender: 'F'
      }
    ]);
  });

  it('extracts phone and email when they appear merged on the next line', () => {
    const result = parseMembershipText(`
      Doe, Jane
      Female
      34 26-May-1991
      8015551212jane@example.com
    `);

    expect(result).toEqual([
      {
        fullName: 'Doe, Jane',
        email: 'jane@example.com',
        phone: '8015551212',
        age: null,
        birthday: 'May 26 1991',
        gender: 'F'
      }
    ]);
  });

  it('splits merged phone prefixes from email addresses (real log samples)', () => {
    const result = parseMembershipText(`
      Abner, Taliena MarieF3226-Mar-1994208-516-8971talienaforever@gmail.com
      Acosta, FrankM6526-May-1960702-236-5833fja2660@gmail.com
      Acosta, Pamela JeanF71915-Sep-1953+17028815748pea.jay.acosta@gmail.com
    `);

    expect(result).toEqual([
      {
        fullName: 'Abner, Taliena Marie',
        email: 'talienaforever@gmail.com',
        phone: '208-516-8971',
        age: null,
        birthday: 'Mar 26 1994',
        gender: 'F'
      },
      {
        fullName: 'Acosta, Frank',
        email: 'fja2660@gmail.com',
        phone: '702-236-5833',
        age: null,
        birthday: 'May 26 1960',
        gender: 'M'
      },
      {
        fullName: 'Acosta, Pamela Jean',
        email: 'pea.jay.acosta@gmail.com',
        phone: '+17028815748',
        age: null,
        birthday: 'Sep 15 1953',
        gender: 'F'
      }
    ]);
  });

  it('handles spaced phone immediately followed by email in compact rows', () => {
    const result = parseMembershipText(`
      Jones, AliceF341-Jan-1980208 516 8971alice@example.com
    `);

    expect(result).toEqual([
      {
        fullName: 'Jones, Alice',
        email: 'alice@example.com',
        phone: '208 516 8971',
        age: null,
        birthday: 'Jan 1 1980',
        gender: 'F'
      }
    ]);
  });

  it('does not turn single-digit birthdays into two-digit merged days', () => {
    const result = parseMembershipText(`
      Acosta, FrankM461-Jan-1980702-236-5833fja2660@gmail.com
    `);

    expect(result).toEqual([
      {
        fullName: 'Acosta, Frank',
        email: 'fja2660@gmail.com',
        phone: '702-236-5833',
        age: null,
        birthday: 'Jan 1 1980',
        gender: 'M'
      }
    ]);
  });

  it('repairs invalid merged day tokens like 99-Dec-yyyy', () => {
    const result = parseMembershipText(`
      Adams, LawrenceM6899-Dec-1946702-373-9875larry.adams6873@gmail.com
    `);

    expect(result).toEqual([
      {
        fullName: 'Adams, Lawrence',
        email: 'larry.adams6873@gmail.com',
        phone: '702-373-9875',
        age: null,
        birthday: 'Dec 9 1946',
        gender: 'M'
      }
    ]);
  });
});
