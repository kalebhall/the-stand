import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';

import { Button } from '@/components/ui/button';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type PortalRow = {
  id: string;
  token: string;
  created_at: string;
};

type ShareRow = {
  id: string;
  meeting_id: string;
  token: string;
  meeting_date: string;
  meeting_type: string;
  created_at: string;
};

export default async function PublicPortalSettingsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !hasRole(session.user.roles, 'STAND_ADMIN')) {
    redirect('/dashboard');
  }

  const wardId = session.activeWardId;

  async function createOrRotatePortalToken() {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (!actionSession.activeWardId || !hasRole(actionSession.user.roles, 'STAND_ADMIN')) {
      redirect('/settings/public-portal');
    }

    const newToken = randomBytes(24).toString('base64url');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      await client.query(
        `INSERT INTO public_program_portal (ward_id, token)
         VALUES ($1, $2)
         ON CONFLICT (ward_id)
         DO UPDATE SET token = EXCLUDED.token`,
        [actionSession.activeWardId, newToken]
      );

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'PORTAL_TOKEN_ROTATED', jsonb_build_object('action', 'rotate'))`,
        [actionSession.activeWardId, actionSession.user.id]
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to create or rotate portal token');
    } finally {
      client.release();
    }

    revalidatePath('/settings/public-portal');
  }

  async function revokePortalToken() {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (!actionSession.activeWardId || !hasRole(actionSession.user.roles, 'STAND_ADMIN')) {
      redirect('/settings/public-portal');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      await client.query('DELETE FROM public_program_portal WHERE ward_id = $1', [actionSession.activeWardId]);

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'PORTAL_TOKEN_REVOKED', jsonb_build_object('action', 'revoke'))`,
        [actionSession.activeWardId, actionSession.user.id]
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to revoke portal token');
    } finally {
      client.release();
    }

    revalidatePath('/settings/public-portal');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const portalResult = await client.query(
      'SELECT id, token, created_at FROM public_program_portal WHERE ward_id = $1 LIMIT 1',
      [wardId]
    );

    const sharesResult = await client.query(
      `SELECT pps.id, pps.meeting_id, pps.token, m.meeting_date, m.meeting_type, pps.created_at
         FROM public_program_share pps
         JOIN meeting m ON m.id = pps.meeting_id
        WHERE pps.ward_id = $1
        ORDER BY m.meeting_date DESC
        LIMIT 20`,
      [wardId]
    );

    await client.query('COMMIT');

    const portal = portalResult.rows[0] as PortalRow | undefined;
    const shares = sharesResult.rows as ShareRow[];
    const baseUrl = process.env.APP_BASE_URL ?? '';

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Public Portal Settings</h1>
          <p className="text-sm text-muted-foreground">Manage public access tokens for sharing meeting programs with ward members.</p>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Ward Portal Token</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            The ward portal token provides a stable URL that always shows the most recent published program.
          </p>

          {portal ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/50 p-3">
                <p className="text-sm font-medium">Portal URL</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {baseUrl}/p/ward/{portal.token}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Created: {new Date(portal.created_at).toLocaleString()}</p>
              <div className="flex gap-2">
                <form action={createOrRotatePortalToken}>
                  <Button type="submit" variant="outline" size="sm">Rotate token</Button>
                </form>
                <form action={revokePortalToken}>
                  <Button type="submit" variant="outline" size="sm">Revoke token</Button>
                </form>
              </div>
            </div>
          ) : (
            <form action={createOrRotatePortalToken}>
              <Button type="submit" size="sm">Create portal token</Button>
            </form>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Meeting Share Links</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Individual share tokens are created automatically when a meeting is published.
          </p>
          {shares.length ? (
            <ul className="space-y-2">
              {shares.map((share) => (
                <li key={share.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{share.meeting_date} — {share.meeting_type.replaceAll('_', ' ')}</p>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {baseUrl}/p/{share.token}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No meeting share links yet. Publish a meeting to generate a share link.</p>
          )}
        </section>
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load public portal settings');
  } finally {
    client.release();
  }
}
