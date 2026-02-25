import { NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';

import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { makeMemberBirthdayKey } from '@/src/imports/callings';
import { importFromLcr } from '@/src/imports/lcr';
import { createLogger } from '@/src/lib/logger';

export const runtime = 'nodejs';

type LcrImportBody = {
  username?: unknown;
  password?: unknown;
  twoFactorCode?: unknown;
  commit?: unknown;
};

type ImportRunRow = QueryResultRow & { id: string };
type MemberRow = QueryResultRow & { id: string; full_name: string; birthday: string | null };

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const logger = createLogger('lcr-import');
  const session = await auth().catch(() => null);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as LcrImportBody;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const twoFactorCode = typeof body.twoFactorCode === 'string' ? body.twoFactorCode.trim() : '';
  const commit = body.commit === true;

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  let imported;

  try {
    imported = await importFromLcr({ username, password, twoFactorCode: twoFactorCode || undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import from LCR';
    return NextResponse.json({ error: message, code: 'IMPORT_FAILED' }, { status: 422 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const membershipRun = await client.query(
      `INSERT INTO import_run (ward_id, import_type, raw_text, parsed_count, committed, created_by_user_id)
       VALUES ($1, 'MEMBERSHIP', $2, $3, $4, $5)
       RETURNING id`,
      [wardId, imported.memberRawText, imported.members.length, commit, session.user.id]
    );

    const callingsRun = await client.query(
      `INSERT INTO import_run (ward_id, import_type, raw_text, parsed_count, committed, created_by_user_id)
       VALUES ($1, 'CALLINGS', $2, $3, $4, $5)
       RETURNING id`,
      [wardId, imported.callingRawText, imported.callings.length, commit, session.user.id]
    );

    let memberInserted = 0;
    let memberUpdated = 0;
    let callingInserted = 0;
    let replacedCount = 0;
    let matchedMembers = 0;
    let unmatchedMembers = 0;

    if (commit) {
      for (const parsed of imported.members) {
        const upsertResult = await client.query(
          `INSERT INTO member (ward_id, full_name, email, phone, age, birthday, gender)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (ward_id, full_name)
           DO UPDATE SET
             email = COALESCE(EXCLUDED.email, member.email),
             phone = COALESCE(EXCLUDED.phone, member.phone),
             age = COALESCE(EXCLUDED.age, member.age),
             birthday = COALESCE(EXCLUDED.birthday, member.birthday),
             gender = COALESCE(EXCLUDED.gender, member.gender),
             updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [wardId, parsed.fullName, parsed.email, parsed.phone, parsed.age, parsed.birthday, parsed.gender]
        );

        if (upsertResult.rows[0]?.inserted) {
          memberInserted += 1;
        } else {
          memberUpdated += 1;
        }
      }

      const membersResult = await client.query(
        `SELECT id, full_name, birthday FROM member WHERE ward_id = $1`,
        [wardId]
      );
      const memberByKey = new Map<string, string>(
        (membersResult.rows as MemberRow[])
          .filter((row) => row.birthday)
          .map((row) => [makeMemberBirthdayKey(row.full_name, row.birthday ?? ''), row.id] as const)
      );

      const existingResult = await client.query(`SELECT id FROM calling_assignment WHERE ward_id = $1`, [wardId]);
      replacedCount = existingResult.rowCount ?? 0;
      await client.query('DELETE FROM calling_assignment WHERE ward_id = $1', [wardId]);

      for (const parsed of imported.callings) {
        const memberId = memberByKey.get(makeMemberBirthdayKey(parsed.memberName, parsed.birthday)) ?? null;
        if (memberId) {
          matchedMembers += 1;
        } else {
          unmatchedMembers += 1;
        }

        await client.query(
          `INSERT INTO calling_assignment (ward_id, member_id, member_name, birthday, organization, calling_name, sustained, set_apart, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
          [
            wardId,
            memberId,
            parsed.memberName,
            parsed.birthday,
            parsed.organization,
            parsed.callingName,
            parsed.sustained,
            parsed.setApart
          ]
        );
        callingInserted += 1;
      }

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'LCR_IMPORT_COMMITTED', jsonb_build_object('membershipImportRunId', $3::text, 'callingsImportRunId', $4::text, 'memberParsedCount', $5::int, 'callingParsedCount', $6::int, 'memberInserted', $7::int, 'memberUpdated', $8::int, 'callingInserted', $9::int, 'replacedCount', $10::int, 'matchedMembers', $11::int, 'unmatchedMembers', $12::int))`,
        [
          wardId,
          session.user.id,
          (membershipRun.rows[0] as ImportRunRow).id,
          (callingsRun.rows[0] as ImportRunRow).id,
          imported.members.length,
          imported.callings.length,
          memberInserted,
          memberUpdated,
          callingInserted,
          replacedCount,
          matchedMembers,
          unmatchedMembers
        ]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      commit,
      membership: {
        importRunId: (membershipRun.rows[0] as ImportRunRow).id,
        parsedCount: imported.members.length,
        inserted: memberInserted,
        updated: memberUpdated,
        preview: imported.members
      },
      callings: {
        importRunId: (callingsRun.rows[0] as ImportRunRow).id,
        parsedCount: imported.callings.length,
        inserted: callingInserted,
        replacedCount,
        matchedMembers,
        unmatchedMembers,
        preview: imported.callings
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');

    const message = error instanceof Error ? error.message : 'unknown error';
    logger.error('Failed to process LCR import', {
      wardId,
      userId: session.user.id,
      commitRequested: commit,
      parsedMemberCount: imported.members.length,
      parsedCallingCount: imported.callings.length,
      error: message
    });

    return NextResponse.json(
      { error: `Failed to process LCR import: ${message}`, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
