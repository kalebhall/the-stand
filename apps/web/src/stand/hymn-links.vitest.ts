import { describe, expect, it } from 'vitest';

import { buildHymnUrl, hymnSlug } from './hymn-links';

describe('hymn links', () => {
  it('builds official standard hymn links', () => {
    expect(buildHymnUrl('1', 'The Morning Breaks')).toBe(
      'https://www.churchofjesuschrist.org/study/manual/hymns/the-morning-breaks?lang=eng'
    );
  });

  it('builds official childrens songbook links', () => {
    expect(buildHymnUrl('C1', 'I Am a Child of God')).toBe(
      'https://www.churchofjesuschrist.org/study/manual/childrens-songbook/i-am-a-child-of-god?lang=eng'
    );
  });

  it('uses Church search for new-book entries and rejects incomplete hymns', () => {
    expect(buildHymnUrl('1052', 'Joyfully Bound')).toBe('https://www.churchofjesuschrist.org/search?lang=eng&query=Joyfully%20Bound');
    expect(buildHymnUrl('1', '')).toBeNull();
    expect(hymnSlug('Come, Come, Ye Saints')).toBe('come-come-ye-saints');
  });
});
