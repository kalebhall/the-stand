import { redirect } from 'next/navigation';

import { MembershipImportsClient } from './membership-imports-client';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type MemberRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type MemberNoteRow = {
  id: string;
  member_id: string;
  note_text: string;
  created_at: string;
  created_by_email: string | null;
};

export default async function ImportsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const memberResult = await client.query(
      `SELECT id, full_name, email, phone
         FROM member
        WHERE ward_id = $1
        ORDER BY full_name ASC`,
      [session.activeWardId]
    );

    const noteResult = await client.query(
      `SELECT mn.id, mn.member_id, mn.note_text, mn.created_at, ua.email AS created_by_email
         FROM member_note mn
         LEFT JOIN user_account ua ON ua.id = mn.created_by_user_id
        WHERE mn.ward_id = $1
        ORDER BY mn.created_at DESC
        LIMIT 100`,
      [session.activeWardId]
    );

    await client.query('COMMIT');

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
          <p className="text-sm text-muted-foreground">Paste membership text for dry-run preview or commit updates, then maintain restricted member notes.</p>
        </section>

        <MembershipImportsClient
          wardId={session.activeWardId}
          members={memberResult.rows as MemberRow[]}
          memberNotes={noteResult.rows as MemberNoteRow[]}
        />
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load imports');
  } finally {
    client.release();
  }
}
