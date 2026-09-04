import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { INTRODUCTION_ITEM_TYPE, isMeetingType, type IntroductionRoles, type ProgramItemInput } from '@/src/meetings/types';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getIntroductionRoles(value: unknown): IntroductionRoles | null {
  if (!value || typeof value !== 'object') return null;
  const roles = value as Partial<IntroductionRoles>;
  const visitingLeaders = Array.isArray(roles.visitingLeaders)
    ? roles.visitingLeaders
        .filter((leader) => Boolean(leader) && typeof leader === 'object')
        .map((leader) => ({ name: toTrimmedString(leader.name), calling: toTrimmedString(leader.calling) }))
        .filter((leader) => leader.name || leader.calling)
    : [];
  return {
    presiding: toTrimmedString(roles.presiding),
    conducting: toTrimmedString(roles.conducting),
    organist: toTrimmedString(roles.organist),
    chorister: toTrimmedString(roles.chorister),
    ...(visitingLeaders.length ? { visitingLeaders } : {})
  };
}

type MeetingListItem = {
  id: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
  program_item_count: string;
};

async function insertProgramItems(
  client: Awaited<ReturnType<typeof pool.connect>>,
  wardId: string,
  meetingId: string,
  programItems: ProgramItemInput[]
) {
  for (const [index, item] of programItems.entries()) {
    const itemType = toTrimmedString(item?.itemType);
    if (!itemType) continue;

    const values = [
      wardId,
      meetingId,
      index + 1,
      itemType,
      toTrimmedString(item?.title),
      toTrimmedString(item?.notes),
      toTrimmedString(item?.topic),
      toTrimmedString(item?.programNotes),
      toTrimmedString(item?.hymnNumber),
      toTrimmedString(item?.hymnTitle),
      itemType === INTRODUCTION_ITEM_TYPE ? JSON.stringify(getIntroductionRoles(item?.introductionRoles)) : null
    ];
    await client.query(
      `INSERT INTO meeting_program_item (ward_id, meeting_id, sequence, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), NULLIF($10, ''), $11::jsonb)`,
      values
    );
  }
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const result = await client.query(
      `SELECT m.id,
              m.meeting_date,
              m.meeting_type,
              m.status,
              COUNT(mpi.id)::text AS program_item_count
         FROM meeting m
         LEFT JOIN meeting_program_item mpi ON mpi.meeting_id = m.id
        WHERE m.ward_id = $1
        GROUP BY m.id
        ORDER BY m.meeting_date DESC`,
      [wardId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      meetings: (result.rows as MeetingListItem[]).map((row) => ({
        id: row.id,
        meetingDate: row.meeting_date,
        meetingType: row.meeting_type,
        status: row.status,
        programItemCount: Number(row.program_item_count)
      }))
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to list meetings', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    meetingDate?: string;
    meetingType?: string;
    programItems?: ProgramItemInput[];
  } | null;
  const meetingDate = toTrimmedString(body?.meetingDate);
  const meetingType = toTrimmedString(body?.meetingType);
  const programItems = Array.isArray(body?.programItems) ? body.programItems : [];

  if (!meetingDate || !isMeetingType(meetingType)) {
    return NextResponse.json({ error: 'Invalid meeting payload', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const legacyIntroductionTypes = new Set(['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER']);
  const introductionIndexes = programItems.reduce<number[]>((indexes, item, index) => {
    const itemType = toTrimmedString(item?.itemType).toUpperCase();
    if (legacyIntroductionTypes.has(itemType) || itemType === INTRODUCTION_ITEM_TYPE) indexes.push(index);
    return indexes;
  }, []);
  const announcementIndexes = programItems.reduce<number[]>((indexes, item, index) => {
    if (toTrimmedString(item?.itemType).toUpperCase() === 'ANNOUNCEMENT') indexes.push(index);
    return indexes;
  }, []);
  const requiresIntroduction = !['STAKE_CONFERENCE', 'GENERAL_CONFERENCE'].includes(meetingType);
  const expectedAnnouncementIndex = requiresIntroduction ? 1 : 0;
  if (
    (requiresIntroduction && (introductionIndexes.length !== 1 || introductionIndexes[0] !== 0)) ||
    (!requiresIntroduction && introductionIndexes.length) ||
    announcementIndexes.length !== 1 ||
    announcementIndexes[0] !== expectedAnnouncementIndex
  ) {
    return NextResponse.json({ error: 'Invalid protected Introduction item', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const inserted = await client.query(
      `INSERT INTO meeting (ward_id, meeting_date, meeting_type)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [wardId, meetingDate, meetingType]
    );

    await insertProgramItems(client, wardId, inserted.rows[0].id, programItems);

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'MEETING_CREATED',
      entityType: 'meeting',
      entityId: inserted.rows[0].id,
      meetingDate,
      changes: {
        meetingDate: { old: null, new: meetingDate },
        meetingType: { old: null, new: meetingType },
        programItemCount: { old: 0, new: programItems.length }
      },
      details: {
        meetingId: inserted.rows[0].id,
        meetingDate,
        meetingType,
        programItemCount: programItems.length
      },
      source: 'manual_ui',
      severity: 'info'
    });

    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'meeting',
      aggregateId: inserted.rows[0].id,
      eventType: 'MEETING_CREATED',
      payload: { meetingId: inserted.rows[0].id, meetingDate, meetingType }
    });

    await client.query('COMMIT');

    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);

    return NextResponse.json({ id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('meeting_create_failed', { wardId, userId: session.user.id, error });
    return NextResponse.json({ error: 'Failed to create meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
