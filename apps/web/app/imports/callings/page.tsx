import { redirect } from 'next/navigation';
import Link from 'next/link';

import { CallingImportClient } from './calling-import-client';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CallingRow = {
  id: string;
  member_name: string;
  organization: string | null;
  calling_name: string;
  sustained_date: string | Date | null;
  set_apart: boolean;
  is_active: boolean;
};

type LatestCallingImportRow = {
  id: string;
  raw_text: string;
  parsed_count: number;
};

const MAX_DRIFT_COMPARE_RAW_TEXT_CHARS = 250_000;

export default async function ImportCallingsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const callingResult = await client.query(
      `SELECT id, member_name, organization, calling_name, sustained_date, set_apart, is_active
         FROM calling_assignment
        WHERE ward_id = $1
        ORDER BY member_name ASC`,
      [session.activeWardId]
    );

    const latestCallingImportResult = await client.query(
      `SELECT id, raw_text, parsed_count
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

    const latestImport = latestCallingImportResult.rows[0] as LatestCallingImportRow | undefined;

    let driftCount = 0;
    if (latestImport) {
      if (latestImport.raw_text.startsWith('[') && latestImport.raw_text.length <= MAX_DRIFT_COMPARE_RAW_TEXT_CHARS) {
        const latestImportSet = new Set(
          (JSON.parse(latestImport.raw_text) as Array<{ memberName: string; callingName: string }>).map(
            (entry) => `${entry.memberName.toLowerCase()}::${entry.callingName.toLowerCase()}`
          )
        );

        driftCount =
          Array.from(currentActiveSet).filter((key) => !latestImportSet.has(key)).length +
          Array.from(latestImportSet).filter((key) => !currentActiveSet.has(key)).length;
      } else {
        driftCount = Math.abs(currentActiveSet.size - latestImport.parsed_count);
      }
    }

    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Import Callings</h1>
            <p className="text-sm text-muted-foreground">Import calling assignments from LCR into The Stand.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/callings" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Manage Callings
            </Link>
            <Link href="/imports/members" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              Import Members →
            </Link>
          </div>
        </div>

        <CallingImportClient
          wardId={session.activeWardId}
          initialCallingDrift={{
            isStale: driftCount > 0,
            driftCount,
            comparedToImportRunId: latestImport?.id ?? null
          }}
        />
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load callings import');
  } finally {
    client.release();
  }
}
