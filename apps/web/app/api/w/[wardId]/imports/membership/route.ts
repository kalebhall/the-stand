import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { parseMembershipText, toPlainText } from '@/src/imports/membership';
import { createLogger } from '@/src/lib/logger';

type MembershipImportBody = {
  rawText?: unknown;
  commit?: unknown;
};

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const logger = createLogger('membership-import');
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as MembershipImportBody;
  const rawText = typeof body.rawText === 'string' ? body.rawText : '';
  const commit = body.commit === true;

  const plainText = toPlainText(rawText);
  const parsedMembers = parseMembershipText(plainText);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const importRunResult = await client.query(
      `INSERT INTO import_run (ward_id, import_type, raw_text, parsed_count, committed, created_by_user_id)
       VALUES ($1, 'MEMBERSHIP', $2, $3, $4, $5)
       RETURNING id`,
      [wardId, plainText, parsedMembers.length, commit, session.user.id]
    );

    let inserted = 0;
    let updated = 0;

    if (commit) {
      for (const parsed of parsedMembers) {
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
          inserted += 1;
        } else {
          updated += 1;
        }
      }

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'MEMBERSHIP_IMPORT_COMMITTED', jsonb_build_object('importRunId', $3, 'inserted', $4, 'updated', $5, 'parsedCount', $6))`,
        [wardId, session.user.id, importRunResult.rows[0].id, inserted, updated, parsedMembers.length]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      importRunId: importRunResult.rows[0].id as string,
      commit,
      parsedCount: parsedMembers.length,
      inserted,
      updated,
      preview: parsedMembers
    });
  } catch (error) {
    await client.query('ROLLBACK');

    const message = error instanceof Error ? error.message : 'unknown error';

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: session.user.id, wardId });
      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'MEMBERSHIP_IMPORT_FAILED', jsonb_build_object('commitRequested', $3, 'parsedCount', $4, 'error', $5))`,
        [wardId, session.user.id, commit, parsedMembers.length, message]
      );
      await client.query('COMMIT');
    } catch (auditError) {
      await client.query('ROLLBACK');

      logger.error('Failed to write membership import failure to audit log', {
        wardId,
        userId: session.user.id,
        error: auditError instanceof Error ? auditError.message : 'unknown error'
      });
    }

    logger.error('Membership import request failed', {
      wardId,
      userId: session.user.id,
      commitRequested: commit,
      parsedCount: parsedMembers.length,
      error: message
    });

    return NextResponse.json({ error: 'Failed to import membership', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
