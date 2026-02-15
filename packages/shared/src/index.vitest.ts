import { describe, expect, it } from 'vitest';

import {
  healthResponseSchema,
  requestAccessInputSchema,
  meResponseSchema,
  createMeetingSchema,
  createAnnouncementSchema,
  callingStatusSchema,
  changePasswordSchema,
  type HealthResponse
} from './index';

describe('shared validators', () => {
  it('keeps the health response shape', () => {
    const value: HealthResponse = { status: 'ok' };
    expect(value.status).toBe('ok');
  });

  it('validates the health response schema', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('validates request access input', () => {
    const input = { fullName: 'John Doe', email: 'john@example.com' };
    expect(requestAccessInputSchema.parse(input)).toEqual(input);
  });

  it('rejects invalid request access input', () => {
    expect(() => requestAccessInputSchema.parse({ fullName: '', email: 'invalid' })).toThrow();
  });

  it('validates me response schema', () => {
    const response = {
      user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com', displayName: null },
      activeWardId: null,
      roles: ['STAND_ADMIN']
    };
    expect(meResponseSchema.parse(response)).toEqual(response);
  });

  it('validates create meeting schema', () => {
    const meeting = { meetingDate: '2026-03-01', meetingType: 'SACRAMENT' as const };
    expect(createMeetingSchema.parse(meeting)).toEqual(meeting);
  });

  it('rejects invalid meeting type', () => {
    expect(() => createMeetingSchema.parse({ meetingDate: '2026-03-01', meetingType: 'INVALID' })).toThrow();
  });

  it('validates create announcement schema', () => {
    const announcement = { title: 'Ward activity', body: 'Details here', placement: 'PROGRAM_TOP' as const };
    expect(createAnnouncementSchema.parse(announcement)).toEqual(announcement);
  });

  it('validates calling status schema', () => {
    expect(callingStatusSchema.parse('PROPOSED')).toBe('PROPOSED');
    expect(callingStatusSchema.parse('SET_APART')).toBe('SET_APART');
  });

  it('rejects invalid calling status', () => {
    expect(() => callingStatusSchema.parse('INVALID')).toThrow();
  });

  it('validates change password schema', () => {
    const input = { currentPassword: 'oldpass123', newPassword: 'newpassword12' };
    expect(changePasswordSchema.parse(input)).toEqual(input);
  });

  it('rejects short new password', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'short' })).toThrow();
  });
});
