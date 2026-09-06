import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { TechnologyClient } from './technology-client';

type Meeting = { id: string; meeting_date: string; meeting_type: string };
export default async function TechnologyPage() { const session = await requireAuthenticatedSession(); enforcePasswordRotation(session); if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard'); const client = await pool.connect(); let meetings: Meeting[] = []; try { await client.query('BEGIN'); await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId }); const result = await client.query(`SELECT id, meeting_date, meeting_type FROM meeting WHERE ward_id = $1::uuid AND meeting_date >= CURRENT_DATE - 7 ORDER BY meeting_date DESC LIMIT 20`, [session.activeWardId]); await client.query('COMMIT'); meetings = result.rows as Meeting[]; } catch { await client.query('ROLLBACK'); } finally { client.release(); } return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8"><section className="space-y-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Technology and streaming checklist</h1><p className="mt-1 text-sm text-muted-foreground">Room, audio, stream, accessibility, and recording lifecycle readiness.</p></div><a href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>Dashboard</a></div><p className="text-xs text-muted-foreground">Store authorized links only. Never store passwords, tokens, Wi-Fi keys, or streaming credentials.</p></section><TechnologyClient wardId={session.activeWardId} meetings={meetings}/></main>; }
