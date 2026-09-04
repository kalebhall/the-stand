import { createHmac } from 'node:crypto';

const IDENTITY_SECRET_ENV = 'MEMBER_IDENTITY_SECRET';

export function getMemberIdentitySecret(): string {
  const secret = process.env[IDENTITY_SECRET_ENV];
  if (!secret || secret.length < 32) {
    throw new Error(`${IDENTITY_SECRET_ENV} must be configured with at least 32 characters`);
  }
  return secret;
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeBirthday(value: string): string {
  const normalized = normalize(value);
  const dmy = normalized.match(/^\d{1,2}\s+([a-z]{3,})\s*(?:\d{4})?$/);
  if (dmy) return `${dmy[1].slice(0, 3)} ${Number(value.match(/^\d{1,2}/)?.[0] ?? 0)}`;

  const mdy = normalized.match(/^([a-z]{3,})\s+(\d{1,2})(?:\s+\d{4})?$/);
  if (mdy) return `${mdy[1].slice(0, 3)} ${Number(mdy[2])}`;

  return normalized;
}

export function makeMemberIdentityKey(params: { fullName: string; birthday: string; secret?: string }): string | null {
  const birthday = normalizeBirthday(params.birthday);
  if (!birthday) return null;

  const payload = `${normalize(params.fullName)}|${birthday}`;
  return createHmac('sha256', params.secret ?? getMemberIdentitySecret())
    .update(payload, 'utf8')
    .digest('hex');
}

export function makeSafeImportSnapshot(value: unknown): string {
  return JSON.stringify(value);
}
