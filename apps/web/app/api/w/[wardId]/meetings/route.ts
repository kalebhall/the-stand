import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isMeetingType, type ProgramItemInput } from '@/src/meetings/types';

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
    const itemType = item.itemType?.trim() ?? '';
    if (!itemType) continue;

    await client.query(
      `INSERT INTO meeting_program_item (ward_id, meeting_id, sequence, item_type, title, notes, hymn_number, hymn_title)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''))`,
      [
        wardId,
        meetingId,
        index + 1,
        itemType,
        item.title?.trim() ?? '',
        item.notes?.trim() ?? '',
        item.hymnNumber?.trim() ?? '',
        item.hymnTitle?.trim() ?? ''
      ]
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
  const meetingDate = body?.meetingDate?.trim() ?? '';
  const meetingType = body?.meetingType?.trim() ?? '';
  const programItems = Array.isArray(body?.programItems) ? body.programItems : [];

  if (!meetingDate || !isMeetingType(meetingType)) {
    return NextResponse.json({ error: 'Invalid meeting payload', code: 'BAD_REQUEST' }, { status: 400 });
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

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEETING_CREATED', jsonb_build_object('meetingId', $3, 'meetingDate', $4, 'meetingType', $5, 'programItemCount', $6))`,
      [wardId, session.user.id, inserted.rows[0].id, meetingDate, meetingType, programItems.length]
    );

    await client.query('COMMIT');

    return NextResponse.json({ id: inserted.rows[0].id }, { status: 201 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to create meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
