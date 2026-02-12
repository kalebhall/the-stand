import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('phase 12 production-readiness checks', () => {
  it('keeps runtime logs free from secrets except one-time bootstrap password output', () => {
    const filesToScan = [
      'apps/web/server.mjs',
      'apps/web/src/bootstrap.mjs',
      'apps/web/src/db/bootstrap-support-admin.ts'
    ];

    const sensitivePattern = /process\.env|database_url|session_secret|auth_google_secret|password_hash|token/i;

    for (const file of filesToScan) {
      const content = read(file);
      const logLines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.includes('console.'));

      for (const line of logLines) {
        const isBootstrapPasswordLine =
          file === 'apps/web/src/db/bootstrap-support-admin.ts' &&
          line.includes('Support Admin bootstrap password (shown once): ${password}');

        if (!isBootstrapPasswordLine) {
          expect(sensitivePattern.test(line), `Unexpected sensitive log in ${file}: ${line}`).toBe(false);
        }
      }
    }
  });

  it('enables rate limiting on required endpoints', () => {
    const requiredFiles = [
      'apps/web/src/auth/auth.ts',
      'apps/web/app/api/account/change-password/route.ts',
      'apps/web/app/api/public/access-requests/route.ts'
    ];

    for (const file of requiredFiles) {
      const content = read(file);
      expect(content, `${file} must enforce rate limiting`).toContain('enforceRateLimit(');
    }
  });

  it('keeps acceptance criteria document present for full-suite validation', () => {
    const acceptanceDoc = read('docs/ACCEPTANCE.md');
    expect(acceptanceDoc).toContain('SECTION 13 — HEALTH & DEPLOYMENT');
    expect(acceptanceDoc).toContain('SECTION 14 — FAILURE CONDITIONS');
  });
});
