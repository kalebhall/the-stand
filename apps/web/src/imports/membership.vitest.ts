import { describe, expect, it } from 'vitest';

import { parseMembershipText, toPlainText } from './membership';

describe('membership import parsing', () => {
  it('strips html to plain text', () => {
    const parsed = toPlainText('<p>Jane Doe, jane@example.com, 801-555-0101</p><p>John Doe</p>');

    expect(parsed).toBe('Jane Doe, jane@example.com, 801-555-0101\nJohn Doe');
  });

  it('parses rows and tolerates malformed spacing', () => {
    const result = parseMembershipText(`
      Jane Doe  ,  jane@example.com   , 801-555-0101
      John Doe|801-555-4444
      Sister Example\tjane2@example.com
    `);

    expect(result).toEqual([
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: '801-555-0101' },
      { fullName: 'John Doe', email: null, phone: '801-555-4444' },
      { fullName: 'Sister Example', email: 'jane2@example.com', phone: null }
    ]);
  });

  it('deduplicates by name and preserves newest provided fields', () => {
    const result = parseMembershipText(`
      Jane Doe
      Jane Doe, jane@example.com
      Jane Doe, 801-555-0101
    `);

    expect(result).toEqual([{ fullName: 'Jane Doe', email: 'jane@example.com', phone: '801-555-0101' }]);
  });
});
