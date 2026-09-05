import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { PublicLayoutClient } from './public-layout-client';

export default async function PublicLayoutPage() { const session = await requireAuthenticatedSession(); enforcePasswordRotation(session); if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard'); const client = await pool.connect(); let layout = { preset: 'SINGLE_SHEET_BIFOLD', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE' }; try { await client.query('BEGIN'); await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId }); const result = await client.query('SELECT preset, announcement_mode, cover_mode FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1', [session.activeWardId]); if (result.rowCount) layout = result.rows[0] as typeof layout; await client.query('COMMIT'); } catch { await client.query('ROLLBACK'); } finally { client.release(); } return <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6"><section className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">Public program layout</h1><p className="mt-1 text-sm text-muted-foreground">Choose restrained print/public presets.</p></div><a href="/settings/public-portal" className={cn(buttonVariants({ variant: 'outline' }))}>Public portal</a></section><PublicLayoutClient wardId={session.activeWardId} initial={layout}/></main>; }
