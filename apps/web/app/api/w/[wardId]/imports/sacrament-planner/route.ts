import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canRunImports } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { normalizeHistoricalName, type HistoricalMeeting, type HistoricalProgramItem } from '@/src/imports/sacrament-planner';

const MAX_MEETINGS = 150;
const PERSON_ITEM_TYPES = new Set(['PRESIDING', 'CONDUCTING', 'INVOCATION', 'BENEDICTION', 'SPEAKER']);

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateMeetings(value: unknown): HistoricalMeeting[] | null {
  if (!Array.isArray(value) || value.length > MAX_MEETINGS) return null;
  const meetings: HistoricalMeeting[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Partial<HistoricalMeeting>;
    if (!isDate(item.meetingDate) || !clean(item.meetingType) || !Array.isArray(item.programItems)) return null;
    const programItems: HistoricalProgramItem[] = [];
    for (const rawItem of item.programItems) {
      if (!rawItem || typeof rawItem !== 'object') return null;
      const source = rawItem as Partial<HistoricalProgramItem>;
      const itemType = clean(source.itemType);
      if (!itemType || itemType.length > 64) return null;
      programItems.push({
        itemType,
        title: clean(source.title),
        topic: clean(source.topic) || undefined,
        hymnNumber: clean(source.hymnNumber) || undefined,
        hymnTitle: clean(source.hymnTitle) || undefined
      });
    }
    meetings.push({ meetingDate: item.meetingDate, meetingType: clean(item.meetingType), programItems });
  }
  return meetings;
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId } = await context.params;
  if (!canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { meetings?: unknown; commit?: boolean } | null;
  const meetings = validateMeetings(body?.meetings);
  if (!meetings) return NextResponse.json({ error: 'Invalid historical meeting payload', code: 'BAD_REQUEST' }, { status: 400 });
  const commit = body?.commit === true;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const members = await client.query('SELECT id, full_name FROM member WHERE ward_id = $1::uuid ORDER BY full_name', [wardId]);
    const memberMap = new Map<string, { id: string; fullName: string }[]>();
    for (const member of members.rows) {
      const key = normalizeHistoricalName(member.full_name);
      memberMap.set(key, [...(memberMap.get(key) ?? []), { id: member.id, fullName: member.full_name }]);
    }

    const unmatched = new Set<string>();
    let skippedExisting = 0;
    let importedMeetings = 0;
    let importedItems = 0;
    const normalizedMeetings = meetings.map((meeting) => ({
      ...meeting,
      programItems: meeting.programItems.map((item) => {
        if (
          !item.title ||
          item.itemType === 'OPENING_HYMN' ||
          item.itemType === 'SACRAMENT_HYMN' ||
          item.itemType === 'CLOSING_HYMN' ||
          item.itemType === 'SPECIAL_HYMN'
        )
          return item;
        const matches = memberMap.get(normalizeHistoricalName(item.title)) ?? [];
        if (matches.length === 1) return { ...item, title: matches[0].fullName };
        if (matches.length !== 1) unmatched.add(item.title);
        return item;
      })
    }));

    for (const meeting of normalizedMeetings) {
      const existing = await client.query('SELECT id FROM meeting WHERE ward_id = $1::uuid AND meeting_date = $2::date LIMIT 1', [
        wardId,
        meeting.meetingDate
      ]);
      if (existing.rowCount) {
        skippedExisting += 1;
        continue;
      }
      if (commit) {
        const inserted = await client.query(
          `INSERT INTO meeting (ward_id, meeting_date, meeting_type, status)
           VALUES ($1::uuid, $2::date, $3::text, 'COMPLETED') RETURNING id`,
          [wardId, meeting.meetingDate, meeting.meetingType]
        );
        for (const [index, item] of meeting.programItems.entries()) {
          await client.query(
            `INSERT INTO meeting_program_item
              (ward_id, meeting_id, sequence, item_type, title, topic, hymn_number, hymn_title)
             VALUES ($1::uuid, $2::uuid, $3::int, $4::text, NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), NULLIF($8::text, ''))`,
            [
              wardId,
              inserted.rows[0].id,
              index + 1,
              item.itemType,
              item.title,
              item.topic ?? '',
              item.hymnNumber ?? '',
              item.hymnTitle ?? ''
            ]
          );
          importedItems += 1;
        }
        for (const item of meeting.programItems) {
          if (!PERSON_ITEM_TYPES.has(item.itemType) || !item.title) continue;
          const matches = memberMap.get(normalizeHistoricalName(item.title)) ?? [];
          if (matches.length === 1) continue;
          await client.query(
            `INSERT INTO historical_import_name_review
              (ward_id, source_name, normalized_name, occurrence_count, first_seen_date, last_seen_date)
             VALUES ($1::uuid, $2::text, $3::text, 1, $4::date, $4::date)
             ON CONFLICT (ward_id, source_name) DO UPDATE
               SET occurrence_count = historical_import_name_review.occurrence_count + 1,
                   first_seen_date = LEAST(historical_import_name_review.first_seen_date, EXCLUDED.first_seen_date),
                   last_seen_date = GREATEST(historical_import_name_review.last_seen_date, EXCLUDED.last_seen_date),
                   updated_at = now()`,
            [wardId, item.title, normalizeHistoricalName(item.title), meeting.meetingDate]
          );
        }
        importedMeetings += 1;
      }
    }

    if (commit) {
      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1::uuid, $2::uuid, 'HISTORICAL_MEETINGS_IMPORTED', $3::jsonb)`,
        [
          wardId,
          session.user.id,
          JSON.stringify({ meetingCount: importedMeetings, itemCount: importedItems, skippedExisting, unmatchedCount: unmatched.size })
        ]
      );
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    return NextResponse.json({
      commit,
      meetingCount: meetings.length,
      importedMeetings,
      importedItems,
      skippedExisting,
      unmatchedNames: [...unmatched].sort()
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('historical_sacrament_planner_import_failed', { wardId, userId: session.user.id, error });
    return NextResponse.json({ error: 'Historical import failed', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
