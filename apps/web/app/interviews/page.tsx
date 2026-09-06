import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { InterviewsClient } from './interviews-client';

type Interview = { id: string; interview_type: string; member_name: string; interviewer_name: string; scheduled_at: string; status: string };
export default async function InterviewsPage() { const session = await requireAuthenticatedSession(); enforcePasswordRotation(session); if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard'); const client = await pool.connect(); let interviews: Interview[] = []; try { await client.query('BEGIN'); await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId }); const result = await client.query(`SELECT id, interview_type, member_name, interviewer_name, scheduled_at, status FROM scheduled_interview WHERE ward_id = $1::uuid AND status != 'CANCELLED' ORDER BY scheduled_at`, [session.activeWardId]); await client.query('COMMIT'); interviews = result.rows as Interview[]; } catch { await client.query('ROLLBACK'); } finally { client.release(); } return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8"><section className="space-y-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Scheduled interviews</h1><p className="mt-1 text-sm text-muted-foreground">Operational scheduling only. Do not record confidential interview content.</p></div><a href={`/api/w/${session.activeWardId}/interviews/calendar`} download="the-stand-interviews.ics" className={cn(buttonVariants({ variant: 'outline' }))}>Export calendar</a><a href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>Dashboard</a></div></section><InterviewsClient wardId={session.activeWardId} initial={interviews}/></main>; }
