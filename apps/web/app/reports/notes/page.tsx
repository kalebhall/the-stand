import Link from 'next/link';
import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canUseInternalNotes } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type NoteReportRow = {
  id: string;
  visibility: 'LEADERSHIP' | 'PRIVATE' | 'PUBLIC';
  note_text: string;
  created_at: string;
  created_by_email: string | null;
  member_name: string | null;
  meeting_date: string | null;
  program_item_type: string | null;
  program_item_title: string | null;
};

function optionalDate(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function NotesReportPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string; visibility?: string; target?: string }>;
}) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');

  const filters = await searchParams;
  const from = optionalDate(filters.from);
  const to = optionalDate(filters.to);
  const visibility = filters.visibility === 'LEADERSHIP' || filters.visibility === 'PRIVATE' ? filters.visibility : 'ALL';
  const target = filters.target === 'MEMBER' || filters.target === 'MEETING' || filters.target === 'PROGRAM_ITEM' ? filters.target : 'ALL';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const result = await client.query(
      `SELECT note.id, note.visibility, note.note_text, note.created_at, ua.email AS created_by_email,
              member.full_name AS member_name, meeting.meeting_date,
              item.item_type AS program_item_type, item.title AS program_item_title
         FROM internal_note note
         LEFT JOIN user_account ua ON ua.id = note.created_by_user_id
         LEFT JOIN member ON member.id = note.member_id
         LEFT JOIN meeting ON meeting.id = note.meeting_id
         LEFT JOIN meeting_program_item item ON item.id = note.program_item_id
        WHERE note.ward_id = $1::uuid
          AND (note.visibility IN ('LEADERSHIP', 'PUBLIC') OR note.created_by_user_id = $2::uuid)
          AND ($3::date IS NULL OR note.created_at >= $3::date)
          AND ($4::date IS NULL OR note.created_at < ($4::date + INTERVAL '1 day'))
          AND ($5::text = 'ALL' OR note.visibility = $5::text)
          AND ($6::text = 'ALL' OR ($6::text = 'MEMBER' AND note.member_id IS NOT NULL) OR ($6::text = 'MEETING' AND note.meeting_id IS NOT NULL) OR ($6::text = 'PROGRAM_ITEM' AND note.program_item_id IS NOT NULL))
        ORDER BY note.created_at DESC LIMIT 500`,
      [session.activeWardId, session.user.id, from, to, visibility, target]
    );
    await client.query('COMMIT');
    const notes = result.rows as NoteReportRow[];
    return <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <section><Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground">← All reports</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">Notes report</h1><p className="text-sm text-muted-foreground">Ward notes visible to your account.</p></section>
      <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4"><label className="text-sm">From<input name="from" type="date" defaultValue={from ?? ''} className="mt-1 w-full rounded-md border bg-background p-2" /></label><label className="text-sm">To<input name="to" type="date" defaultValue={to ?? ''} className="mt-1 w-full rounded-md border bg-background p-2" /></label><label className="text-sm">Visibility<select name="visibility" defaultValue={visibility} className="mt-1 w-full rounded-md border bg-background p-2"><option value="ALL">All visible to me</option><option value="LEADERSHIP">Bishopric / clerk</option><option value="PRIVATE">My private notes</option></select></label><label className="text-sm">Note on<select name="target" defaultValue={target} className="mt-1 w-full rounded-md border bg-background p-2"><option value="ALL">All targets</option><option value="MEMBER">Member</option><option value="MEETING">Meeting</option><option value="PROGRAM_ITEM">Meeting item</option></select></label><button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground sm:col-span-4">Apply filters</button></form>
      <section className="space-y-3"><p className="text-sm text-muted-foreground">{notes.length} notes shown.</p>{notes.map((note) => { const subject = note.member_name ? `Member: ${note.member_name}` : note.meeting_date ? `Meeting: ${note.meeting_date}` : `Meeting item: ${note.program_item_title ?? note.program_item_type ?? 'Untitled'}`; return <article key={note.id} className="rounded-lg border bg-card p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{subject} · {note.visibility === 'PRIVATE' ? 'Personal' : note.visibility === 'PUBLIC' ? 'Public program' : 'Bishopric / Clerk'}</span><span>{note.created_by_email ?? 'Unknown author'} · {new Date(note.created_at).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{note.note_text}</p></article>; })}{!notes.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No notes match filters.</p> : null}</section>
    </main>;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('notes_report_load_failed', { wardId: session.activeWardId, userId: session.user.id, error });
    throw new Error('Failed to load notes report');
  } finally { client.release(); }
}
