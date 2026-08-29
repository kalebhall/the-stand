import nodemailer from 'nodemailer';

import type { NotificationDigestFrequency } from './email-preferences';
import { getNotificationEventDefinition } from './events';
import type { NotificationSeverity } from './events';

export type NotificationEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailProvider = 'disabled' | 'smtp' | 'webhook';

type DigestEmailItem = {
  title: string;
  summary: string;
  targetUrl: string | null;
};

export function usableEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function configuredProvider(): EmailProvider {
  const value = process.env.NOTIFICATION_EMAIL_PROVIDER?.trim().toLowerCase();
  if (value === 'smtp' || value === 'webhook' || value === 'disabled') return value;
  return process.env.NOTIFICATION_EMAIL_WEBHOOK_URL ? 'webhook' : 'disabled';
}

function getAppBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function getSafeTargetUrl(targetUrl: string | null): string {
  const appUrl = getAppBaseUrl();
  return targetUrl?.startsWith('/') ? `${appUrl}${targetUrl}` : `${appUrl}/notifications`;
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
  const safeTarget = getSafeTargetUrl(args.targetUrl);
  const text = `${args.title}\n\n${args.summary}\n\nOpen in The Stand: ${safeTarget}`;
  return {
    to: args.recipientEmail.trim(),
    subject: `The Stand: ${args.title}`,
    text,
    html: `<p><strong>${escapeHtml(args.title)}</strong></p><p>${escapeHtml(args.summary)}</p><p><a href="${escapeHtml(safeTarget)}">Open in The Stand</a></p>`
  };
}

export function formatDigestNotificationEmail(args: {
  frequency: NotificationDigestFrequency;
  recipientEmail: string;
  items: readonly DigestEmailItem[];
}): NotificationEmailMessage {
  const digestLabel = args.frequency === 'DAILY' ? 'daily' : 'weekly';
  const subject = `The Stand ${digestLabel} digest (${args.items.length} ${args.items.length === 1 ? 'update' : 'updates'})`;
  const lines = args.items.map((item, index) => `${index + 1}. ${item.title}\n${item.summary}\nOpen in The Stand: ${getSafeTargetUrl(item.targetUrl)}`);
  const htmlItems = args.items.map((item) => `<li><p><strong>${escapeHtml(item.title)}</strong></p><p>${escapeHtml(item.summary)}</p><p><a href="${escapeHtml(getSafeTargetUrl(item.targetUrl))}">Open in The Stand</a></p></li>`);

  return {
    to: args.recipientEmail.trim(),
    subject,
    text: `${subject}\n\n${lines.join('\n\n')}`,
    html: `<p>${escapeHtml(subject)}</p><ol>${htmlItems.join('')}</ol>`
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export async function deliverNotificationEmail(message: NotificationEmailMessage): Promise<{ externalId?: string }> {
  const provider = configuredProvider();
  if (provider === 'disabled') {
    throw new Error('Email delivery unavailable: configure NOTIFICATION_EMAIL_PROVIDER=smtp and SMTP_HOST, or select webhook.');
  }

  if (provider === 'webhook') return deliverThroughWebhook(message);

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? '587');
  const from = process.env.NOTIFICATION_EMAIL_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !from) {
    throw new Error('Email delivery unavailable: SMTP_HOST, SMTP_PORT, and NOTIFICATION_EMAIL_FROM are required.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } : undefined
  });
  const result = await transporter.sendMail({
    from,
    to: message.to,
    replyTo: process.env.NOTIFICATION_EMAIL_REPLY_TO?.trim() || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
  return { externalId: result.messageId };
}

async function deliverThroughWebhook(message: NotificationEmailMessage): Promise<{ externalId?: string }> {
  const providerUrl = process.env.NOTIFICATION_EMAIL_WEBHOOK_URL;
  if (!providerUrl) throw new Error('Email delivery unavailable: NOTIFICATION_EMAIL_WEBHOOK_URL is not configured.');
  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message)
  });
  if (!response.ok) throw new Error(`Email provider failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return { externalId: response.headers.get('x-delivery-id') ?? undefined };
}
