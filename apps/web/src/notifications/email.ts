import { getNotificationEventDefinition } from './events';
import type { NotificationSeverity } from './events';

export type NotificationEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function usableEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function formatNotificationEmail(args: {
  eventType: string;
  recipientEmail: string | null | undefined;
  title: string;
  summary: string;
  targetUrl: string | null;
  severity: NotificationSeverity;
}): NotificationEmailMessage | null {
  if (!usableEmail(args.recipientEmail)) return null;
  getNotificationEventDefinition(args.eventType);
  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const safeTarget = args.targetUrl?.startsWith('/') ? `${appUrl}${args.targetUrl}` : `${appUrl}/notifications`;
  const text = `${args.title}\n\n${args.summary}\n\nOpen in The Stand: ${safeTarget}`;
  return {
    to: args.recipientEmail.trim(),
    subject: `The Stand: ${args.title}`,
    text,
    html: `<p><strong>${escapeHtml(args.title)}</strong></p><p>${escapeHtml(args.summary)}</p><p><a href="${escapeHtml(safeTarget)}">Open in The Stand</a></p>`
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export async function deliverNotificationEmail(message: NotificationEmailMessage): Promise<{ externalId?: string }> {
  const providerUrl = process.env.NOTIFICATION_EMAIL_WEBHOOK_URL;
  if (!providerUrl) {
    throw new Error('Email delivery unavailable: NOTIFICATION_EMAIL_WEBHOOK_URL is not configured.');
  }
  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message)
  });
  if (!response.ok) {
    throw new Error(`Email provider failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  return { externalId: response.headers.get('x-delivery-id') ?? undefined };
}
