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

  it('handles tab-separated header rows', () => {
    const result = parseMembershipText("Name\tEmail\tAge\tBirthday\nJane Doe\tjane@example.com\t30\tFeb 14");

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
});
