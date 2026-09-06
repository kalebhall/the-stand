import { createHash, randomBytes } from 'node:crypto';

export function createInterviewCalendarToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInterviewCalendarToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function interviewCalendarFeedUrl(token: string, baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'): string {
  return `${baseUrl.replace(/\/$/, '')}/api/calendar/interviews/${encodeURIComponent(token)}`;
}
