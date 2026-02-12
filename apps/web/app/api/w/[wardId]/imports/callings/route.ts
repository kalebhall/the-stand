import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { parseCallingsText, toPlainText } from '@/src/imports/callings';

type CallingsImportBody = {
  rawText?: unknown;
  commit?: unknown;
};

function makeCallingKey(memberName: string, callingName: string): string {
  return `${memberName.toLowerCase()}::${callingName.toLowerCase()}`;
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;

  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as CallingsImportBody;
  const rawText = typeof body.rawText === 'string' ? body.rawText : '';
  const commit = body.commit === true;

  const plainText = toPlainText(rawText);
  const parsedCallings = parseCallingsText(plainText);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const importRunResult = await client.query(
      `INSERT INTO import_run (ward_id, import_type, raw_text, parsed_count, committed, created_by_user_id)
       VALUES ($1, 'CALLINGS', $2, $3, $4, $5)
       RETURNING id, created_at`,
      [wardId, plainText, parsedCallings.length, commit, session.user.id]
    );

    const existingResult = await client.query(
      `SELECT id, member_name, calling_name, is_active
         FROM calling_assignment
        WHERE ward_id = $1`,
      [wardId]
    );

    const existingByKey = new Map(
      existingResult.rows.map((row) => [makeCallingKey(row.member_name as string, row.calling_name as string), row])
    );


    let inserted = 0;
    let reactivated = 0;
    let releasesApplied = 0;

    if (commit) {
      for (const parsed of parsedCallings) {
        const existing = existingByKey.get(makeCallingKey(parsed.memberName, parsed.callingName)) as
          | { id: string; is_active: boolean }
          | undefined;

        if (parsed.isRelease) {
          if (existing && existing.is_active) {
            await client.query(
              `UPDATE calling_assignment
                  SET is_active = FALSE
                WHERE id = $1
                  AND ward_id = $2`,
              [existing.id, wardId]
            );
            releasesApplied += 1;
          }
          continue;
        }

        if (!existing) {
          await client.query(
            `INSERT INTO calling_assignment (ward_id, member_name, calling_name, is_active)
             VALUES ($1, $2, $3, TRUE)`,
            [wardId, parsed.memberName, parsed.callingName]
          );
          inserted += 1;
          continue;
        }

        if (!existing.is_active) {
          await client.query(
            `UPDATE calling_assignment
                SET is_active = TRUE
              WHERE id = $1
                AND ward_id = $2`,
            [existing.id, wardId]
          );
          reactivated += 1;
        }
      }

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'CALLINGS_IMPORT_COMMITTED', jsonb_build_object('importRunId', $3, 'inserted', $4, 'reactivated', $5, 'releasesApplied', $6, 'parsedCount', $7))`,
        [wardId, session.user.id, importRunResult.rows[0].id, inserted, reactivated, releasesApplied, parsedCallings.length]
      );
    }

    const currentActiveResult = await client.query(
      `SELECT member_name, calling_name
         FROM calling_assignment
        WHERE ward_id = $1
          AND is_active = TRUE`,
      [wardId]
    );

    const staleResult = await client.query(
      `SELECT id, raw_text
         FROM import_run
        WHERE ward_id = $1
          AND import_type = 'CALLINGS'
          AND committed = TRUE
          AND id <> $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [wardId, importRunResult.rows[0].id]
    );

    let isStale = false;
    let driftCount = 0;

    if (staleResult.rowCount && staleResult.rows[0]?.raw_text) {
      const staleParsed = parseCallingsText(staleResult.rows[0].raw_text as string).filter((entry) => !entry.isRelease);
      const staleSet = new Set(staleParsed.map((entry) => makeCallingKey(entry.memberName, entry.callingName)));
      const currentActiveSet = new Set(
        currentActiveResult.rows.map((row) => makeCallingKey(row.member_name as string, row.calling_name as string))
      );

      const inImportNotCurrent = Array.from(staleSet).filter((key) => !currentActiveSet.has(key)).length;
      const inCurrentNotImport = Array.from(currentActiveSet).filter((key) => !staleSet.has(key)).length;

      driftCount = inImportNotCurrent + inCurrentNotImport;
      isStale = driftCount > 0;
    }

    const releaseCount = parsedCallings.filter((entry) => entry.isRelease).length;
    const activeCount = parsedCallings.length - releaseCount;

    await client.query('COMMIT');

    return NextResponse.json({
      importRunId: importRunResult.rows[0].id as string,
      commit,
      parsedCount: parsedCallings.length,
      activeCount,
      releaseCount,
      inserted,
      reactivated,
      releasesApplied,
      stale: {
        isStale,
        driftCount,
        comparedToImportRunId: staleResult.rows[0]?.id ?? null
      },
      preview: parsedCallings
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to import callings', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
