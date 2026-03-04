import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canRunImports } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { parseMembershipText, toPlainText } from '@/src/imports/membership';
import { extractPdfText } from '@/src/imports/pdf';
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
  if (!canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let extractedText: string;
  let fileName = 'paste';
  let commit = false;

  if (contentType.includes('application/json')) {
    // Plain text paste (legacy format)
    const body = (await request.json().catch(() => ({}))) as MembershipImportBody;
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';
    commit = body.commit === true;
    extractedText = toPlainText(rawText);
    fileName = 'paste';
  } else if (contentType.includes('multipart/form-data') || contentType === '') {
    // PDF upload (or FormData without explicit content-type)
    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return NextResponse.json({ error: 'Invalid request format', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const commitValue = formData.get('commit');
    commit = commitValue === 'true';
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A PDF file is required', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    fileName = file.name;
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    extractedText = await extractPdfText(await file.arrayBuffer());

    // DEBUG: Log first 500 chars of extracted text
    logger.debug('PDF extraction result', {
      fileName,
      extractedLength: extractedText.length,
      preview: extractedText.substring(0, 500),
      firstThreeLines: extractedText.split('\n').slice(0, 3)
    });
  } else {
    return NextResponse.json({ error: 'Unsupported content type', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  logger.debug('Starting membership import request', {
    wardId,
    userId: session.user.id,
    commitRequested: commit,
    fileName
  });

  const parsedMembers = parseMembershipText(extractedText);

  logger.debug('Membership data parsed', {
    wardId,
    userId: session.user.id,
    commitRequested: commit,
    extractedCharCount: extractedText.length,
    parsedCount: parsedMembers.length,
    parsedPreview: parsedMembers.slice(0, 5)
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const importRunResult = await client.query(
      `INSERT INTO import_run (ward_id, import_type, raw_text, parsed_count, committed, created_by_user_id)
       VALUES ($1, 'MEMBERSHIP', $2, $3, $4, $5)
       RETURNING id`,
      [wardId, extractedText, parsedMembers.length, commit, session.user.id]
    );

    const importRunId = importRunResult.rows[0]?.id as string | undefined;

    if (!importRunId) {
      throw new Error('Failed to create import run');
    }

    if (parsedMembers.length === 0) {
      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'MEMBERSHIP_IMPORT_ISSUE', jsonb_build_object('importRunId', $3::text, 'issue', $4::text, 'commitRequested', $5::boolean, 'fileName', $6::text, 'extractedTextPreview', $7::text))`,
        [wardId, session.user.id, importRunId, 'PARSE_ZERO_ROWS', commit, fileName, extractedText.substring(0, 1000)]
      );

      await client.query('COMMIT');

      logger.warn('Membership import parsed zero rows', {
        wardId,
        userId: session.user.id,
        importRunId,
        commitRequested: commit,
        fileName,
        extractedTextPreview: extractedText.substring(0, 500)
      });

      if (commit) {
        return NextResponse.json(
          {
            error: 'No member rows could be parsed from the uploaded file',
            code: 'VALIDATION_ERROR',
            parsedCount: 0,
            importRunId,
            debug: {
              extractedLength: extractedText.length,
              preview: extractedText.substring(0, 200)
            }
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        importRunId,
        commit: false,
        parsedCount: 0,
        inserted: 0,
        updated: 0,
        issues: ['PARSE_ZERO_ROWS'],
        preview: [],
        debug: {
          extractedLength: extractedText.length,
          preview: extractedText.substring(0, 200)
        }
      });
    }

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
         VALUES ($1, $2, 'MEMBERSHIP_IMPORT_COMMITTED', jsonb_build_object('importRunId', $3::text, 'inserted', $4::int, 'updated', $5::int, 'parsedCount', $6::int))`,
        [wardId, session.user.id, importRunId, inserted, updated, parsedMembers.length]
      );
    }

    await client.query('COMMIT');

    logger.info('Membership import completed', {
      wardId,
      userId: session.user.id,
      importRunId,
      commitApplied: commit,
      parsedCount: parsedMembers.length,
      inserted,
      updated,
      fileName
    });

    return NextResponse.json({
      importRunId,
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
         VALUES ($1, $2, 'MEMBERSHIP_IMPORT_FAILED', jsonb_build_object('commitRequested', $3::boolean, 'parsedCount', $4::int, 'error', $5::text))`,
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
      fileName,
      error: message
    });

    return NextResponse.json({ error: 'Failed to import membership', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
