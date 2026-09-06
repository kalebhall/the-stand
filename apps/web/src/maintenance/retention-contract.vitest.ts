import { describe, expect, it } from 'vitest';

import {
  AUDIT_LOG_PURGE_COUNT_SQL,
  AUDIT_LOG_PURGE_SQL,
  DEFAULT_AUDIT_LOG_RETENTION_DAYS,
  normalizeAuditLogRetentionDays,
  normalizeRawPasteRetentionDays,
  RAW_PASTE_PURGE_COUNT_SQL,
  RAW_PASTE_PURGE_SQL
} from './retention-contract.js';

describe('retention contract', () => {
  it('uses conservative bounded defaults', () => {
    expect(DEFAULT_AUDIT_LOG_RETENTION_DAYS).toBe(2555);
    expect(normalizeRawPasteRetentionDays(30)).toBe(30);
    expect(normalizeAuditLogRetentionDays(365)).toBe(365);
  });

  it('rejects invalid or unsafe retention windows', () => {
    expect(() => normalizeRawPasteRetentionDays(0)).toThrow();
    expect(() => normalizeRawPasteRetentionDays(3651)).toThrow();
    expect(() => normalizeAuditLogRetentionDays(364)).toThrow();
    expect(() => normalizeAuditLogRetentionDays(3651)).toThrow();
    expect(() => normalizeAuditLogRetentionDays(30.5)).toThrow();
  });

  it('keeps raw text as a marker and deletes only expired audit rows', () => {
    expect(RAW_PASTE_PURGE_SQL).toContain('SET raw_text = $2::text');
    expect(RAW_PASTE_PURGE_COUNT_SQL).toContain('$1::int');
    expect(AUDIT_LOG_PURGE_SQL).toContain('DELETE FROM audit_log');
    expect(AUDIT_LOG_PURGE_SQL).toContain('$1::int');
    expect(AUDIT_LOG_PURGE_COUNT_SQL).toContain('FROM audit_log');
  });
});
