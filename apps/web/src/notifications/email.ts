import nodemailer from 'nodemailer';

import { getNotificationEventDefinition } from './events';
import type { NotificationSeverity } from './events';

export type NotificationEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailProvider = 'disabled' | 'smtp' | 'webhook';

function usableEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function configuredProvider(): EmailProvider {
  const value = process.env.NOTIFICATION_EMAIL_PROVIDER?.trim().toLowerCase();
  if (value === 'smtp' || value === 'webhook' || value === 'disabled') return value;
  return process.env.NOTIFICATION_EMAIL_WEBHOOK_URL ? 'webhook' : 'disabled';
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
  const appUrl = process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const safeTarget = args.targetUrl?.startsWith('/') ? `${appUrl.replace(/\/$/, '')}${args.targetUrl}` : `${appUrl.replace(/\/$/, '')}/notifications`;
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
