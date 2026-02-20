import { NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { makeMemberBirthdayKey, parseCallingsPdfText } from '@/src/imports/callings';
import { extractPdfText } from '@/src/imports/pdf';
import { createLogger } from '@/src/lib/logger';

type ImportRunRow = QueryResultRow & {
  id: string;
  created_at: string;
};

type ActiveCallingRow = QueryResultRow & {
  member_name: string;
  birthday: string | null;
  calling_name: string;
};

type MemberRow = QueryResultRow & {
  id: string;
  full_name: string;
  birthday: string | null;
};

type StaleImportRow = QueryResultRow & {
  id: string;
  raw_text: string;
};

function makeCallingKey(memberName: string, birthday: string, callingName: string): string {
  return `${memberName.toLowerCase()}::${birthday.toLowerCase()}::${callingName.toLowerCase()}`;
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const logger = createLogger('callings-import');
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;

  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const commitValue = formData?.get('commit');
  const commit = commitValue === 'true';
  const file = formData?.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const fileName = file.name;
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  logger.debug('Starting callings import request', {
    wardId,
    userId: session.user.id,
    commitRequested: commit,
    fileName,
    fileSizeBytes: file.size,
    fileType: file.type
  });

  const extractedText = await extractPdfText(await file.arrayBuffer());
  const extractedLines = extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsedCallings = parseCallingsPdfText(extractedText);

  logger.debug('Callings PDF parsed', {
    wardId,
    userId: session.user.id,
    commitRequested: commit,
    extractedCharCount: extractedText.length,
    extractedLineCount: extractedLines.length,
    extractedPreview: extractedLines.slice(0, 3),
    parsedCount: parsedCallings.length,
    parsedPreview: parsedCallings.slice(0, 3)
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const importRunResult = await client.query(
      `INSERT INTO import_run (ward_id, import_type, raw_text, parsed_count, committed, created_by_user_id)
       VALUES ($1, 'CALLINGS', $2, $3, $4, $5)
       RETURNING id, created_at`,
      [wardId, extractedText, parsedCallings.length, commit, session.user.id]
    );

    const importRun = importRunResult.rows[0] as ImportRunRow | undefined;

    if (!importRun) {
      throw new Error('Failed to create import run');
    }

    if (parsedCallings.length === 0) {
      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'CALLINGS_IMPORT_ISSUE', jsonb_build_object('importRunId', $3::text, 'issue', $4::text, 'commitRequested', $5::boolean, 'fileName', $6::text, 'extractedCharCount', $7::int, 'extractedLineCount', $8::int))`,
        [
          wardId,
          session.user.id,
          importRun.id,
          'PARSE_ZERO_ROWS',
          commit,
          fileName,
          extractedText.length,
          extractedLines.length
        ]
      );

      await client.query('COMMIT');

      logger.warn('Callings import parsed zero rows', {
        wardId,
        userId: session.user.id,
        importRunId: importRun.id,
        commitRequested: commit,
        fileName,
        extractedCharCount: extractedText.length,
        extractedLineCount: extractedLines.length
      });

      if (commit) {
        return NextResponse.json(
          {
            error: 'No callings rows could be parsed from the uploaded PDF',
            code: 'VALIDATION_ERROR',
            parsedCount: 0,
            importRunId: importRun.id
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        importRunId: importRun.id,
        commit: false,
        parsedCount: 0,
        inserted: 0,
        replacedCount: 0,
        matchedMembers: 0,
        unmatchedMembers: 0,
        stale: {
          isStale: false,
          driftCount: 0,
          comparedToImportRunId: null
        },
        issues: ['PARSE_ZERO_ROWS'],
        preview: []
      });
    }

    const membersResult = await client.query(
      `SELECT id, full_name, birthday
         FROM member
        WHERE ward_id = $1`,
      [wardId]
    );

    const memberByKey = new Map<string, string>(
      (membersResult.rows as MemberRow[])
        .filter((row) => row.birthday)
        .map((row) => [makeMemberBirthdayKey(row.full_name, row.birthday ?? ''), row.id] as const)
    );

    const existingResult = await client.query(
      `SELECT id, member_name, birthday, calling_name
         FROM calling_assignment
        WHERE ward_id = $1`,
      [wardId]
    );

    let inserted = 0;
    let matchedMembers = 0;
    let unmatchedMembers = 0;
    let replacedCount = 0;

    if (commit) {
      replacedCount = existingResult.rowCount ?? 0;
      await client.query('DELETE FROM calling_assignment WHERE ward_id = $1', [wardId]);

      for (const parsed of parsedCallings) {
        const memberId = memberByKey.get(makeMemberBirthdayKey(parsed.memberName, parsed.birthday)) ?? null;
        if (memberId) {
          matchedMembers += 1;
        } else {
          unmatchedMembers += 1;
        }

        await client.query(
          `INSERT INTO calling_assignment (
              ward_id,
              member_id,
              member_name,
              birthday,
              organization,
              calling_name,
              sustained,
              set_apart,
              is_active
            )
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
        inserted += 1;
      }

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'CALLINGS_IMPORT_COMMITTED', jsonb_build_object('importRunId', $3::text, 'inserted', $4::int, 'replacedCount', $5::int, 'matchedMembers', $6::int, 'unmatchedMembers', $7::int, 'parsedCount', $8::int))`,
        [wardId, session.user.id, importRun.id, inserted, replacedCount, matchedMembers, unmatchedMembers, parsedCallings.length]
      );
    }

    const currentActiveResult = await client.query(
      `SELECT member_name, birthday, calling_name
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
      [wardId, importRun.id]
    );

    let isStale = false;
    let driftCount = 0;

    if (staleResult.rowCount && (staleResult.rows[0] as StaleImportRow | undefined)?.raw_text) {
      const staleImport = staleResult.rows[0] as StaleImportRow;
      const staleParsed = parseCallingsPdfText(staleImport.raw_text);
      const staleSet = new Set(staleParsed.map((entry) => makeCallingKey(entry.memberName, entry.birthday, entry.callingName)));
      const currentActiveSet = new Set(
        (currentActiveResult.rows as ActiveCallingRow[]).map((row) =>
          makeCallingKey(row.member_name, row.birthday ?? '', row.calling_name)
        )
      );

      const inImportNotCurrent = Array.from(staleSet).filter((key) => !currentActiveSet.has(key)).length;
      const inCurrentNotImport = Array.from(currentActiveSet).filter((key) => !staleSet.has(key)).length;

      driftCount = inImportNotCurrent + inCurrentNotImport;
      isStale = driftCount > 0;
    }

    await client.query('COMMIT');

    logger.info('Callings import completed', {
      wardId,
      userId: session.user.id,
      importRunId: importRun.id,
      commitApplied: commit,
      parsedCount: parsedCallings.length,
      inserted,
      replacedCount,
      matchedMembers,
      unmatchedMembers,
      stale: {
        isStale,
        driftCount,
        comparedToImportRunId: (staleResult.rows[0] as StaleImportRow | undefined)?.id ?? null
      }
    });

    return NextResponse.json({
      importRunId: importRun.id,
      commit,
      parsedCount: parsedCallings.length,
      inserted,
      replacedCount,
      matchedMembers,
      unmatchedMembers,
      stale: {
        isStale,
        driftCount,
        comparedToImportRunId: (staleResult.rows[0] as StaleImportRow | undefined)?.id ?? null
      },
      preview: parsedCallings
    });
  } catch (err) {
    await client.query('ROLLBACK');

    const message = err instanceof Error ? err.message : 'unknown error';

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: session.user.id, wardId });
      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'CALLINGS_IMPORT_FAILED', jsonb_build_object('commitRequested', $3::boolean, 'parsedCount', $4::int, 'fileName', $5::text, 'error', $6::text))`,
        [wardId, session.user.id, commit, parsedCallings.length, fileName, message]
      );
      await client.query('COMMIT');
    } catch (auditError) {
      await client.query('ROLLBACK');
      logger.error('Failed to write callings import failure to audit log', {
        wardId,
        userId: session.user.id,
        error: auditError instanceof Error ? auditError.message : 'unknown error'
      });
    }

    logger.error('Callings import failed', {
      wardId,
      userId: session.user.id,
      commitRequested: commit,
      fileName,
      parsedCount: parsedCallings.length,
      error: message
    });

    return NextResponse.json({ error: 'Failed to import callings', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
