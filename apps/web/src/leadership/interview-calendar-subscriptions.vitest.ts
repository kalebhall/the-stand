import { describe, expect, it } from 'vitest';
import { createInterviewCalendarToken, hashInterviewCalendarToken, interviewCalendarFeedUrl } from './interview-calendar-subscriptions';

describe('interview calendar subscriptions', () => {
  it('creates high-entropy URL-safe tokens and one-way hashes', () => {
    const token = createInterviewCalendarToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashInterviewCalendarToken(token)).toHaveLength(64);
    expect(hashInterviewCalendarToken(token)).not.toContain(token);
  });

  it('builds a stable feed URL without leaking a base URL slash', () => {
    expect(interviewCalendarFeedUrl('token/value', 'https://stand.example/')).toBe('https://stand.example/api/calendar/interviews/token%2Fvalue');
  });
});
