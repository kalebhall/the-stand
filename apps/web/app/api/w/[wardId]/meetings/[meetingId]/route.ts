import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { isConferenceMeetingType, migrateBusinessLinesOffConference } from '@/src/callings/meeting-business';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';

const logger = createLogger('meetings');
import { INTRODUCTION_ITEM_TYPE, isMeetingType, SPEAKER_STATUSES, validateProgramItemsForMeetingType, type IntroductionRoles, type ProgramItemInput } from '@/src/meetings/types';

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

type ProgramItemRow = {
  id: string;
  item_type: string;
  title: string | null;
  notes: string | null;
  topic: string | null;
  program_notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
  introduction_roles: IntroductionRoles | null;
  speaker_status: string | null;
  sequence: number;
};

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      'SELECT id, meeting_date, meeting_type, status FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1',
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const itemsResult = await client.query(
      `SELECT id, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles, speaker_status, sequence
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, wardId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      meeting: {
        id: meetingResult.rows[0].id,
        meetingDate: meetingResult.rows[0].meeting_date,
        meetingType: meetingResult.rows[0].meeting_type,
        status: meetingResult.rows[0].status,
        programItems: (itemsResult.rows as ProgramItemRow[]).map((item) => ({
          id: item.id,
          itemType: item.item_type,
          title: item.title ?? '',
          notes: item.notes ?? '',
          topic: item.topic ?? '',
          programNotes: item.program_notes ?? '',
          hymnNumber: item.hymn_number ?? '',
          hymnTitle: item.hymn_title ?? '',
          introductionRoles: item.introduction_roles ?? undefined,
          speakerStatus: item.speaker_status as ProgramItemInput['speakerStatus'],
          sequence: item.sequence
        }))
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to load meeting', { wardId, meetingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to load meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const existing = await client.query(
      'SELECT meeting_date, meeting_type FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
      [meetingId, wardId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const existingMeeting = existing.rows[0] as { meeting_date: string; meeting_type: string };
    if ((body?.meetingDate !== undefined && !meetingDate) || (body?.meetingType !== undefined && !isMeetingType(meetingType))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid meeting payload', code: 'BAD_REQUEST' }, { status: 400 });
    }
    if (
      (body?.meetingDate !== undefined && meetingDate !== existingMeeting.meeting_date) ||
      (body?.meetingType !== undefined && meetingType !== existingMeeting.meeting_type)
    ) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Meeting date and type cannot be changed after creation', code: 'IMMUTABLE_FIELDS' },
        { status: 409 }
      );
    }

    const programRuleError = validateProgramItemsForMeetingType(existingMeeting.meeting_type, programItems);
    if (programRuleError) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: programRuleError, code: 'MEETING_TYPE_RULE' }, { status: 422 });
    }

    const protectedIntroductionTypes = new Set(['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER']);
    const introductionIndexes = programItems.reduce<number[]>((indexes, item, index) => {
      const itemType = toTrimmedString(item?.itemType).toUpperCase();
      if (protectedIntroductionTypes.has(itemType) || itemType === INTRODUCTION_ITEM_TYPE) indexes.push(index);
      return indexes;
    }, []);
    const announcementIndexes = programItems.reduce<number[]>((indexes, item, index) => {
      if (toTrimmedString(item?.itemType).toUpperCase() === 'ANNOUNCEMENT') indexes.push(index);
      return indexes;
    }, []);
    const requiresIntroduction = !isConferenceMeetingType(existingMeeting.meeting_type);
    const expectedAnnouncementIndex = requiresIntroduction ? 1 : 0;
    if (
      (requiresIntroduction && (introductionIndexes.length !== 1 || introductionIndexes[0] !== 0)) ||
      (!requiresIntroduction && introductionIndexes.length) ||
      announcementIndexes.length !== 1 ||
      announcementIndexes[0] !== expectedAnnouncementIndex
    ) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid protected Introduction item', code: 'BAD_REQUEST' }, { status: 400 });
    }

    await client.query(
      `UPDATE meeting
          SET updated_at = now()
        WHERE id = $1::uuid AND ward_id = $2::uuid
        RETURNING id`,
      [meetingId, wardId]
    );

    // Keep pending ward-business lines aligned with conference meetings.
    if (isConferenceMeetingType(existingMeeting.meeting_type)) {
      await migrateBusinessLinesOffConference(client, { wardId, meetingId, newMeetingDate: existingMeeting.meeting_date });
    }

    const retainedIds = programItems.map((item) => toTrimmedString(item?.id)).filter(Boolean);
    await client.query(
      `DELETE FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND NOT (id = ANY($3::uuid[]))`,
      [meetingId, wardId, retainedIds]
    );

    for (const [index, item] of programItems.entries()) {
      const itemType = toTrimmedString(item?.itemType);
      if (!itemType) continue;
      const speakerStatus = itemType.toUpperCase() === 'SPEAKER'
        ? (SPEAKER_STATUSES.includes(item?.speakerStatus as (typeof SPEAKER_STATUSES)[number]) ? item?.speakerStatus : 'PLANNED')
        : null;
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
        itemType.toUpperCase() === INTRODUCTION_ITEM_TYPE ? JSON.stringify(getIntroductionRoles(item?.introductionRoles)) : null,
        speakerStatus
      ];
      if (item?.id && retainedIds.includes(item.id)) {
        await client.query(
          `UPDATE meeting_program_item SET sequence = $3::int, item_type = $4::text, title = NULLIF($5::text, ''), notes = NULLIF($6::text, ''), topic = NULLIF($7::text, ''), program_notes = NULLIF($8::text, ''), hymn_number = NULLIF($9::text, ''), hymn_title = NULLIF($10::text, ''), introduction_roles = $11::jsonb, speaker_status = $12::text WHERE id = $13::uuid AND meeting_id = $2::uuid AND ward_id = $1::uuid`,
          [...values, item.id]
        );
      } else {
        await client.query(
          `INSERT INTO meeting_program_item (ward_id, meeting_id, sequence, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles, speaker_status) VALUES ($1::uuid, $2::uuid, $3::int, $4::text, NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), NULLIF($8::text, ''), NULLIF($9::text, ''), NULLIF($10::text, ''), $11::jsonb, $12::text)`,
          values
        );
      }
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEETING_UPDATED', jsonb_build_object('meetingId', $3::text, 'programItemCount', $4::int))`,
      [wardId, session.user.id, meetingId, programItems.length]
    );

    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'meeting',
      aggregateId: meetingId,
      eventType: 'MEETING_UPDATED',
      payload: {
        meetingId,
        meetingDate: existingMeeting.meeting_date,
        meetingType: existingMeeting.meeting_type,
        programItemCount: programItems.length
      }
    });

    await client.query('COMMIT');
    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('meeting_update_failed', { wardId, meetingId, userId: session.user.id, error });
    return NextResponse.json({ error: 'Failed to update meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const deleted = await client.query('DELETE FROM meeting WHERE id = $1 AND ward_id = $2 RETURNING id', [meetingId, wardId]);

    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEETING_DELETED', jsonb_build_object('meetingId', $3::text))`,
      [wardId, session.user.id, meetingId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete meeting', { wardId, meetingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to delete meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
