import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { hasModulePermission } from '@/src/platform/permissions';
import { isWardModuleEnabled } from '@/src/modules/service';
import { TechnologyClient } from './technology-client';

type Meeting = { id: string; meeting_date: string; meeting_type: string };
export default async function TechnologyPage() { const t = await getTranslations('technology'); const session = await requireAuthenticatedSession(); enforcePasswordRotation(session); if (!session.activeWardId || !hasModulePermission({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId, 'technology-checklist.view') || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'technology-checklist'))) redirect('/dashboard'); const client = await pool.connect(); let meetings: Meeting[] = []; try { await client.query('BEGIN'); await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId }); const result = await client.query(`SELECT id, meeting_date, meeting_type FROM meeting WHERE ward_id = $1::uuid AND meeting_date >= CURRENT_DATE - 7 ORDER BY meeting_date DESC LIMIT 20`, [session.activeWardId]); await client.query('COMMIT'); meetings = result.rows as Meeting[]; } catch { await client.query('ROLLBACK'); } finally { client.release(); } return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8"><section className="space-y-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('description')}</p></div><a href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>{t('dashboard')}</a></div><p className="text-xs text-muted-foreground">{t('privacyNotice')}</p></section><TechnologyClient wardId={session.activeWardId} meetings={meetings}/></main>; }
