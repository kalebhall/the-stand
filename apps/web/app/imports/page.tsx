import { redirect } from 'next/navigation';

import { MembershipImportsClient } from './membership-imports-client';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { parseCallingsText } from '@/src/imports/callings';

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

type CallingRow = {
  id: string;
  member_name: string;
  calling_name: string;
  is_active: boolean;
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

    const callingResult = await client.query(
      `SELECT id, member_name, calling_name, is_active
         FROM calling_assignment
        WHERE ward_id = $1
        ORDER BY member_name ASC`,
      [session.activeWardId]
    );

    const latestCallingImportResult = await client.query(
      `SELECT id, raw_text
         FROM import_run
        WHERE ward_id = $1
          AND import_type = 'CALLINGS'
          AND committed = TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      [session.activeWardId]
    );

    await client.query('COMMIT');

    const currentActiveSet = new Set(
      (callingResult.rows as CallingRow[])
        .filter((row) => row.is_active)
        .map((row) => `${row.member_name.toLowerCase()}::${row.calling_name.toLowerCase()}`)
    );

    const latestImportSet = new Set(
      parseCallingsText((latestCallingImportResult.rows[0]?.raw_text as string | undefined) ?? '')
        .filter((entry) => !entry.isRelease)
        .map((entry) => `${entry.memberName.toLowerCase()}::${entry.callingName.toLowerCase()}`)
    );

    const driftCount =
      Array.from(currentActiveSet).filter((key) => !latestImportSet.has(key)).length +
      Array.from(latestImportSet).filter((key) => !currentActiveSet.has(key)).length;

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
          callingAssignments={callingResult.rows as CallingRow[]}
          initialCallingDrift={{
            isStale: driftCount > 0,
            driftCount,
            comparedToImportRunId: (latestCallingImportResult.rows[0]?.id as string | undefined) ?? null
          }}
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
