import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings, canUseInternalNotes, canViewMeetings } from '@/src/auth/roles';
import { canonicalizeMeeting, createMeetingContext } from '@/src/conducting/model';

import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';

const logger = createLogger('meetings');
import {
  INTRODUCTION_ITEM_TYPE,
  isMeetingType,
  SPEAKER_STATUSES,
  SUPPORTED_PROGRAM_ITEM_TYPES,
  validateProgramItemsForMeetingType,
  validateSpeakerStatusTransition,
  VISITING_LEADER_TYPES,
  type IntroductionRoles,
  type ProgramItemInput
} from '@/src/meetings/types';
import { computeProgramItemsRevision, isSourceManaged, type ProgramItemSourceRow } from '@/src/meetings/program-item-source';
import { sourceRevisionSchema } from '@/src/meetings/program-item-contracts';
import { validateProtectedProgramOrder } from '@/src/meetings/program-item-rules';
import { synchronizePublicProgramNote } from '@/src/meetings/program-item-service';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent } from '@/src/notifications/outbox';

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function canonicalizeProgramValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeProgramValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeProgramValue(entry)])
    );
  }
  return value;
}

function samePersistedProgramValue(next: unknown, current: unknown): boolean {
  if (next === undefined) return true;
  if (next === null || next === '') return current === null || current === '';
  if (typeof next === 'object' || typeof current === 'object') {
    return JSON.stringify(canonicalizeProgramValue(next ?? null)) === JSON.stringify(canonicalizeProgramValue(current ?? null));
  }
  return next === current;
}

function getIntroductionRoles(value: unknown): IntroductionRoles | null {
  if (!value || typeof value !== 'object') return null;
  const roles = value as Partial<IntroductionRoles>;
  const visitingLeaders = Array.isArray(roles.visitingLeaders)
    ? roles.visitingLeaders
        .filter((leader) => Boolean(leader) && typeof leader === 'object')
        .map((leader) => ({
          name: toTrimmedString(leader.name),
          calling: toTrimmedString(leader.calling),
          recognitionType:
            typeof leader.recognitionType === 'string' &&
            VISITING_LEADER_TYPES.includes(leader.recognitionType as (typeof VISITING_LEADER_TYPES)[number])
              ? leader.recognitionType
              : 'OTHER'
        }))
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
  hymn_locale: string;
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
  const includeInternalNotes = canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      'SELECT id, meeting_date, meeting_type, status FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const itemsResult = await client.query(
      `SELECT id, item_type, title, CASE WHEN $3::boolean THEN notes ELSE NULL END AS notes, topic, program_notes, hymn_number, hymn_title, hymn_locale,
              CASE WHEN $3::boolean THEN introduction_roles ELSE (introduction_roles - 'visitingLeaders') END AS introduction_roles,
              speaker_status, sequence
         FROM meeting_program_item
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
        ORDER BY sequence ASC`,
      [meetingId, wardId, includeInternalNotes]
    );

    await client.query('COMMIT');

    const coreMeeting = canonicalizeMeeting({
      id: meetingResult.rows[0].id,
      wardId,
      meetingDate: String(meetingResult.rows[0].meeting_date),
      meetingType: meetingResult.rows[0].meeting_type,
      status: meetingResult.rows[0].status,
      programItems: (itemsResult.rows as ProgramItemRow[]).map((item) => ({
        id: item.id,
        sequence: item.sequence,
        itemType: item.item_type,
        title: item.title,
        notes: item.notes,
        topic: item.topic,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title,
        hymnLocale: item.hymn_locale,
        introductionRoles: item.introduction_roles,
        speakerStatus: item.speaker_status
      }))
    });
    const coreContext = createMeetingContext(session.user.id, wardId, coreMeeting);

    return NextResponse.json({
      meeting: {
        id: coreContext.meeting.id,
        meetingDate: coreContext.meeting.meetingDate,
        meetingType: coreContext.meeting.meetingType,
        status: coreContext.meeting.status,
        programItems: coreContext.meeting.programItems.map((item) => ({
          id: item.id,
          itemType: item.itemType,
          title: item.title ?? '',
          ...(includeInternalNotes ? { notes: item.notes ?? '' } : {}),
          topic: item.topic ?? '',
          programNotes: item.programNotes ?? '',
          hymnNumber: item.hymnNumber ?? '',
          hymnTitle: item.hymnTitle ?? '',
          hymnLocale: item.hymnLocale ?? 'en-US',
          introductionRoles: item.introductionRoles ?? undefined,
          speakerStatus: item.speakerStatus as ProgramItemInput['speakerStatus'],
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
  const includeInternalNotes = canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);

  const body = (await request.json().catch(() => null)) as {
    meetingDate?: string;
    meetingType?: string;
    programItems?: ProgramItemInput[];
    expectedProgramItemsRevision?: string;
  } | null;

  const meetingDate = toTrimmedString(body?.meetingDate);
  const meetingType = toTrimmedString(body?.meetingType);
  const submittedProgramItems = Array.isArray(body?.programItems) ? body.programItems : [];
  const programItems = submittedProgramItems.map((item) => ({
    ...item,
    itemType: toTrimmedString(item?.itemType).toUpperCase()
  }));

  const client = await pool.connect();
  const noteOutboxIds: string[] = [];

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const existing = await client.query(
      'SELECT meeting_date, meeting_type FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1 FOR UPDATE',
      [meetingId, wardId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const existingMeeting = existing.rows[0] as { meeting_date: string; meeting_type: string };
    const existingItems = await client.query(
      'SELECT id, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, hymn_locale, introduction_roles, speaker_status, sequence FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY sequence ASC, id ASC FOR UPDATE',
      [meetingId, wardId]
    );
    const existingItemById = new Map(existingItems.rows.map((item: ProgramItemRow) => [item.id, item] as const));
    const expectedRevision = sourceRevisionSchema.safeParse(body?.expectedProgramItemsRevision);
    if (body?.programItems !== undefined && !expectedRevision.success) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Program item revision is required for a full program save', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }
    if (body?.programItems !== undefined) {
      const currentRevision = computeProgramItemsRevision(existingItems.rows as ProgramItemSourceRow[], { includeInternalNotes });
      if (expectedRevision.data !== currentRevision) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            error: 'The program changed in another session',
            code: 'REVISION_CONFLICT',
            sourceRevision: currentRevision,
            currentProgramItems: existingItems.rows.map((item: ProgramItemRow) => ({
              id: item.id,
              itemType: item.item_type,
              title: item.title ?? '',
              notes: includeInternalNotes ? (item.notes ?? '') : '',
              topic: item.topic ?? '',
              programNotes: item.program_notes ?? '',
              hymnNumber: item.hymn_number ?? '',
              hymnTitle: item.hymn_title ?? '',
              hymnLocale: item.hymn_locale ?? 'en-US',
              introductionRoles: item.introduction_roles ?? undefined,
              speakerStatus: item.speaker_status as ProgramItemInput['speakerStatus']
            }))
          },
          { status: 409 }
        );
      }
    }
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

    const supportedItemTypes = new Set<string>(SUPPORTED_PROGRAM_ITEM_TYPES);
    const suppliedIds = new Set<string>();
    for (const [index, item] of programItems.entries()) {
      const itemId = toTrimmedString(item?.id);
      const itemType = toTrimmedString(item?.itemType).toUpperCase();
      if (!itemType || !supportedItemTypes.has(itemType)) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Unsupported program item type', code: 'BAD_REQUEST' }, { status: 400 });
      }
      if (!itemId) {
        if (
          itemType === INTRODUCTION_ITEM_TYPE ||
          itemType === 'ANNOUNCEMENT' ||
          ['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER', 'SUSTAINING', 'RELEASE'].includes(itemType)
        ) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Protected program items must preserve their existing identity', code: 'BAD_REQUEST' },
            { status: 400 }
          );
        }
        continue;
      }
      if (suppliedIds.has(itemId)) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Duplicate program item id', code: 'BAD_REQUEST' }, { status: 400 });
      }
      if (!existingItemById.has(itemId)) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Program item does not belong to this meeting', code: 'BAD_REQUEST' }, { status: 400 });
      }
      const existingItem = existingItemById.get(itemId);
      if (existingItem && existingItem.item_type.toUpperCase() !== itemType) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Program item type cannot be changed after creation', code: 'IMMUTABLE_FIELDS' },
          { status: 409 }
        );
      }
      if (
        existingItem &&
        isSourceManaged(existingItem.item_type) &&
        (existingItem.sequence !== index + 1 ||
          [
            [item?.title, existingItem.title],
            [item?.notes, existingItem.notes],
            [item?.topic, existingItem.topic],
            [item?.programNotes, existingItem.program_notes],
            [item?.hymnNumber, existingItem.hymn_number],
            [item?.hymnTitle, existingItem.hymn_title],
            [item?.hymnLocale, existingItem.hymn_locale],
            [item?.speakerStatus, existingItem.speaker_status],
            [item?.introductionRoles, existingItem.introduction_roles]
          ].some(([next, current]) => !samePersistedProgramValue(next, current)))
      ) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            error:
              existingItem.item_type.toUpperCase() === 'ANNOUNCEMENT'
                ? 'Announcement entries are managed by Announcements'
                : 'Calling-action program entries are managed by At the Stand',
            code: 'SOURCE_MANAGED'
          },
          { status: 422 }
        );
      }
      suppliedIds.add(itemId);
    }

    for (const item of programItems) {
      const itemId = toTrimmedString(item?.id);
      if (toTrimmedString(item?.itemType).toUpperCase() !== 'SPEAKER' || !itemId) continue;
      const existingItem = existingItemById.get(itemId);
      if (!existingItem || existingItem.item_type.toUpperCase() !== 'SPEAKER') continue;
      const currentStatus = (existingItem.speaker_status ?? 'PLANNED') as (typeof SPEAKER_STATUSES)[number];
      const requestedSpeakerStatus = item.speakerStatus as unknown as string | null | undefined;
      if (
        requestedSpeakerStatus != null &&
        requestedSpeakerStatus !== '' &&
        !SPEAKER_STATUSES.includes(requestedSpeakerStatus as (typeof SPEAKER_STATUSES)[number])
      ) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Invalid speaker status', code: 'INVALID_SPEAKER_STATUS' }, { status: 422 });
      }
      const nextStatus = (
        requestedSpeakerStatus == null || requestedSpeakerStatus === '' ? currentStatus : requestedSpeakerStatus
      ) as (typeof SPEAKER_STATUSES)[number];
      const transitionError = validateSpeakerStatusTransition(currentStatus, nextStatus, item.topic ?? existingItem.topic);
      if (transitionError) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: transitionError, code: 'SPEAKER_STATUS_TRANSITION' }, { status: 422 });
      }
    }

    const protectedOrderError = validateProtectedProgramOrder(
      existingMeeting.meeting_type,
      programItems.map((item, index) => ({ itemType: toTrimmedString(item?.itemType), sequence: index + 1 }))
    );
    if (protectedOrderError) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Invalid protected program order', code: protectedOrderError.code, reason: protectedOrderError.reason },
        { status: 400 }
      );
    }

    const legacyIntroductionTypes = new Set(['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER']);
    const missingLegacyIntroduction = existingItems.rows.find(
      (item: ProgramItemRow) => legacyIntroductionTypes.has(item.item_type.toUpperCase()) && !suppliedIds.has(item.id)
    );
    if (missingLegacyIntroduction) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Legacy introduction entries must preserve their existing identity', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    await client.query(
      `UPDATE meeting
          SET updated_at = now()
        WHERE id = $1::uuid AND ward_id = $2::uuid
        RETURNING id`,
      [meetingId, wardId]
    );

    const retainedIds = programItems.map((item) => toTrimmedString(item?.id)).filter(Boolean);
    const removedItems = existingItems.rows.filter((item: ProgramItemRow) => !retainedIds.includes(item.id));
    if (removedItems.some((item: ProgramItemRow) => isSourceManaged(item.item_type))) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Calling-action program entries are managed by At the Stand', code: 'SOURCE_MANAGED' },
        { status: 422 }
      );
    }
    for (const removedItem of removedItems) {
      noteOutboxIds.push(
        ...(await synchronizePublicProgramNote(client, {
          wardId,
          meetingId,
          programItemId: removedItem.id,
          noteText: null,
          userId: session.user.id,
          actorName: session.user.name || session.user.email || null
        }))
      );
    }
    await client.query(
      `DELETE FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND NOT (id = ANY($3::uuid[]))`,
      [meetingId, wardId, retainedIds]
    );

    for (const [index, item] of programItems.entries()) {
      const itemType = toTrimmedString(item?.itemType);
      if (!itemType) continue;
      const speakerStatus =
        itemType.toUpperCase() === 'SPEAKER'
          ? SPEAKER_STATUSES.includes(item?.speakerStatus as (typeof SPEAKER_STATUSES)[number])
            ? item?.speakerStatus
            : (existingItemById.get(toTrimmedString(item?.id))?.speaker_status ?? 'PLANNED')
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
        item?.hymnLocale || existingItemById.get(toTrimmedString(item?.id))?.hymn_locale || 'en-US',
        itemType.toUpperCase() === INTRODUCTION_ITEM_TYPE ? JSON.stringify(getIntroductionRoles(item?.introductionRoles)) : null,
        speakerStatus
      ];
      const itemId = toTrimmedString(item?.id);
      if (itemId) {
        const existingItem = existingItemById.get(itemId);
        if (existingItem && isSourceManaged(existingItem.item_type)) continue;
        await client.query(
          `UPDATE meeting_program_item SET sequence = $3::int, item_type = $4::text, title = NULLIF($5::text, ''), notes = NULLIF($6::text, ''), topic = NULLIF($7::text, ''), program_notes = NULLIF($8::text, ''), hymn_number = NULLIF($9::text, ''), hymn_title = NULLIF($10::text, ''), hymn_locale = $11::text, introduction_roles = $12::jsonb, speaker_status = $13::text WHERE id = $14::uuid AND meeting_id = $2::uuid AND ward_id = $1::uuid`,
          [...values, itemId]
        );
        const existingProgramNotes = existingItemById.get(itemId)?.program_notes?.trim() || null;
        const nextProgramNotes = toTrimmedString(item?.programNotes) || null;
        if (existingProgramNotes !== nextProgramNotes) {
          noteOutboxIds.push(
            ...(await synchronizePublicProgramNote(client, {
              wardId,
              meetingId,
              programItemId: itemId,
              noteText: nextProgramNotes,
              userId: session.user.id,
              actorName: session.user.name || session.user.email || null
            }))
          );
        }
      } else {
        await client.query(
          `INSERT INTO meeting_program_item (ward_id, meeting_id, sequence, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, hymn_locale, introduction_roles, speaker_status) VALUES ($1::uuid, $2::uuid, $3::int, $4::text, NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), NULLIF($8::text, ''), NULLIF($9::text, ''), NULLIF($10::text, ''), $11::text, $12::jsonb, $13::text)`,
          values
        );
      }
    }

    const updatedItems = await client.query(
      'SELECT id, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, hymn_locale, introduction_roles, speaker_status, sequence FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY sequence ASC, id ASC',
      [meetingId, wardId]
    );
    const finalOrderError = validateProtectedProgramOrder(
      existingMeeting.meeting_type,
      updatedItems.rows.map((row: { item_type: string; sequence: number }) => ({ itemType: row.item_type, sequence: row.sequence }))
    );
    if (finalOrderError) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `Invalid protected program order: ${finalOrderError.reason}`, code: 'PROTECTED_ORDER' },
        { status: 400 }
      );
    }
    const sourceRevision = computeProgramItemsRevision(updatedItems.rows as ProgramItemSourceRow[], { includeInternalNotes });

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEETING_UPDATED', jsonb_build_object('meetingId', $3::text, 'programItemCount', $4::int))`,
      [wardId, session.user.id, meetingId, programItems.length]
    );

    await client.query('COMMIT');
    for (const eventOutboxId of noteOutboxIds) enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);

    return NextResponse.json({ success: true, sourceRevision });
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
