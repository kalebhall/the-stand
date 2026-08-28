import { describe, expect, it, vi } from 'vitest';

import { deliverNotificationEmail, formatNotificationEmail } from './email';

describe('notification email', () => {
  it('formats safe app-linked content and rejects unusable addresses', () => {
    expect(formatNotificationEmail({ eventType: 'MEETING_CREATED', recipientEmail: 'bad', title: '<Meeting>', summary: 'Review & prepare', targetUrl: '/meetings/m-1/edit', severity: 'info' })).toBeNull();
    const message = formatNotificationEmail({ eventType: 'MEETING_CREATED', recipientEmail: 'person@example.com', title: '<Meeting>', summary: 'Review & prepare', targetUrl: '/meetings/m-1/edit', severity: 'info' });
    expect(message).toMatchObject({ to: 'person@example.com', subject: 'The Stand: <Meeting>' });
    expect(message?.html).toContain('&lt;Meeting&gt;');
    expect(message?.html).not.toContain('<Meeting>');
  });

  it('fails deterministically when provider is unavailable', async () => {
    vi.stubEnv('NOTIFICATION_EMAIL_PROVIDER', 'disabled');
    vi.stubEnv('NOTIFICATION_EMAIL_WEBHOOK_URL', '');
    await expect(deliverNotificationEmail({ to: 'person@example.com', subject: 'x', text: 'x', html: '<p>x</p>' })).rejects.toThrow('Email delivery unavailable');
  });

  it('requires portable SMTP configuration when SMTP is selected', async () => {
    vi.stubEnv('NOTIFICATION_EMAIL_PROVIDER', 'smtp');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('NOTIFICATION_EMAIL_FROM', '');
    await expect(deliverNotificationEmail({ to: 'person@example.com', subject: 'x', text: 'x', html: '<p>x</p>' })).rejects.toThrow('SMTP_HOST');
  });
});
