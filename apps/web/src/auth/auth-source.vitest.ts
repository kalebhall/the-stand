import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readAuth = () => readFile(path.resolve(import.meta.dirname, './auth.ts'), 'utf8').then((source) => source.toLowerCase());

describe('authentication authorization boundaries', () => {
  it('does not activate future stake assignments in sessions', async () => {
    const source = await readAuth();
    expect(source).toContain('sur.granted_at <= now()');
  });

  it('loads ward assignments through the RLS-safe database function', async () => {
    const source = await readAuth();
    expect(source).toContain('app.load_user_ward_access($1)');
    expect(source).not.toContain('from ward_user_role w');
  });

  it('periodically refreshes authorization state for existing JWT sessions', async () => {
    const source = await readAuth();
    expect(source).toContain('authzrefreshedat');
    expect(source).toContain('authz_refresh_interval_ms');
    expect(source).toContain('loadsessionuserbyid(token.sub)');
  });

  it('does not apply password rotation to Google OAuth sessions', async () => {
    const source = await readAuth();
    expect(source).toContain("token.authprovider === 'google' ? false : sessionuser.mustchangepassword");
  });
});
