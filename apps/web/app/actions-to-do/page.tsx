import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { ActionsToDoClient, type ActionRow } from './actions-to-do-client';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/platform/auth/session';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/platform/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';

export default async function ActionsToDoPage() {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations('actionsToDo');
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'actions-to-do'))) {
    redirect('/dashboard');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const result = await client.query(
      `SELECT id, family, action_type, status, member_name, description, official_reference_url, due_date
         FROM church_action_follow_up
        WHERE ward_id = $1::uuid
        ORDER BY CASE WHEN status IN ('OPEN', 'IN_PROGRESS') THEN 0 ELSE 1 END,
                 due_date NULLS LAST, created_at ASC`,
      [session.activeWardId]
    );
    await client.query('COMMIT');
    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </section>
        <ActionsToDoClient wardId={session.activeWardId} initialActions={result.rows as ActionRow[]} />
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load Actions to Do');
  } finally {
    client.release();
  }
}
