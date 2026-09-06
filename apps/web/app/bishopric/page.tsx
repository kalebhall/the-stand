import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { LEADERSHIP_MEETING_LABELS, type LeadershipMeetingType } from '@/src/leadership/bishopric';

import { BishopricWorkspaceClient } from './bishopric-workspace-client';

type Meeting = { id: string; meeting_date: string; meeting_type: string; agenda_template: string; status: string; action_count: number; open_action_count: number };
type Action = { id: string; bishopric_meeting_id: string; title: string; details: string | null; decision: string | null; owner_name: string | null; due_date: string | null; status: string; carry_forward: boolean; meeting_date: string; member_id: string | null; linked_member_name: string | null; calling_assignment_id: string | null; linked_calling_name: string | null; linked_membership_action_id: string | null };

export default async function BishopricPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');
  const requestedType = (await searchParams).type;
  const meetingType: LeadershipMeetingType = requestedType === 'WARD_COUNCIL' || requestedType === 'MISSIONARY_COORDINATION' ? requestedType : 'BISHOPRIC';
  const client = await pool.connect();
  let meetings: Meeting[] = [];
  let actions: Action[] = [];
  try {
    await client.query('BEGIN'); await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const meetingResult = await client.query(`SELECT bm.id, bm.meeting_date, bm.agenda_template, bm.status, COUNT(ba.id)::int AS action_count, COUNT(ba.id) FILTER (WHERE ba.status != 'COMPLETED')::int AS open_action_count FROM bishopric_meeting bm LEFT JOIN bishopric_action ba ON ba.bishopric_meeting_id = bm.id AND ba.ward_id = bm.ward_id WHERE bm.ward_id = $1::uuid AND bm.meeting_type = $2::text GROUP BY bm.id ORDER BY bm.meeting_date DESC`, [session.activeWardId, meetingType]);
    const actionResult = await client.query(`SELECT ba.id, ba.bishopric_meeting_id, ba.title, ba.details, ba.decision, ba.owner_name, ba.due_date, ba.status, ba.carry_forward, bm.meeting_date, ba.member_id, m.full_name AS linked_member_name, ba.calling_assignment_id, ca.calling_name AS linked_calling_name, ba.linked_membership_action_id FROM bishopric_action ba JOIN bishopric_meeting bm ON bm.id = ba.bishopric_meeting_id AND bm.ward_id = ba.ward_id LEFT JOIN member m ON m.id = ba.member_id AND m.ward_id = ba.ward_id LEFT JOIN calling_assignment ca ON ca.id = ba.calling_assignment_id AND ca.ward_id = ba.ward_id WHERE ba.ward_id = $1::uuid AND bm.meeting_type = $2::text AND ba.status != 'COMPLETED' ORDER BY ba.due_date NULLS LAST, bm.meeting_date DESC, ba.created_at`, [session.activeWardId, meetingType]);
    await client.query('COMMIT'); meetings = meetingResult.rows as Meeting[]; actions = actionResult.rows as Action[];
  } catch { await client.query('ROLLBACK'); } finally { client.release(); }
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <section className="space-y-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{LEADERSHIP_MEETING_LABELS[meetingType]}</h1><p className="mt-1 text-sm text-muted-foreground">Private coordination agenda, decisions, assignments, and due dates. Not part of public meeting programs.</p></div><a href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>Dashboard</a></div><p className="text-xs text-muted-foreground">Visibility is private and ward-scoped. Do not store confidential counseling details here.</p></section>
    <BishopricWorkspaceClient wardId={session.activeWardId} defaultMeetingType={meetingType} initialMeetings={meetings} initialActions={actions} />
  </main>;
}
