import { redirect } from 'next/navigation';
import Link from 'next/link';

import { MembersManagerClient } from './members-manager-client';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports, canUseInternalNotes } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type MemberRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
};

type MemberNoteRow = {
  id: string;
  member_id: string;
  note_text: string;
  visibility: 'LEADERSHIP' | 'PRIVATE';
  created_at: string;
  created_by_email: string | null;
};

export default async function MembersPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const activeWardId = session.activeWardId;
  const canImportMembers = canRunImports({ roles: session.user.roles, activeWardId }, activeWardId);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const memberResult = await client.query(
      `SELECT id, full_name, first_name, last_name, email, phone, age, gender
         FROM member
        WHERE ward_id = $1
          AND archived_at IS NULL
        ORDER BY last_name ASC, first_name ASC, full_name ASC`,
      [session.activeWardId]
    );

    const noteResult = await client.query(
      `SELECT note.id, note.member_id, note.visibility, note.note_text, note.created_at, ua.email AS created_by_email
         FROM internal_note note
         LEFT JOIN user_account ua ON ua.id = note.created_by_user_id
        WHERE note.ward_id = $1::uuid
          AND note.member_id IS NOT NULL
          AND (note.visibility = 'LEADERSHIP' OR note.created_by_user_id = $2::uuid)
        ORDER BY note.created_at DESC
        LIMIT 200`,
      [session.activeWardId, session.user.id]
    );

    await client.query('COMMIT');

    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Members & Notes</h1>
            <p className="text-sm text-muted-foreground">
              Directory of ward members and restricted leadership follow-up notes.
            </p>
          </div>
          {canImportMembers ? (
            <div className="flex items-center gap-2">
              <Link href="/imports/members" className={cn(buttonVariants({ size: 'sm' }))}>
                Import Members
              </Link>
            </div>
          ) : null}
        </div>

        <MembersManagerClient
          wardId={session.activeWardId}
          members={memberResult.rows as MemberRow[]}
          memberNotes={noteResult.rows as MemberNoteRow[]}
          canManageMembers={canImportMembers}
        />
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load members');
  } finally {
    client.release();
  }
}
