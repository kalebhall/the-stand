import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { AddCallingSection } from '@/components/AddCallingSection';
import { Button } from '@/components/ui/button';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageCallings, canViewCallings } from '@/src/auth/roles';
import { canTransitionCallingStatus, type CallingStatus } from '@/src/callings/lifecycle';
import { STANDARD_CALLINGS } from '@/src/callings/standard-callings';
import { appendCallingStatus, fetchCurrentCallingStatus } from '@/src/callings/transition';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type CallingQueueRow = {
  id: string;
  member_name: string;
  calling_name: string;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Proposed',
  EXTENDED: 'Extended',
  SUSTAINED: 'Sustained',
  SET_APART: 'Set Apart'
};

function nextTransition(status: string): { toStatus: CallingStatus; label: string } | null {
  if (status === 'PROPOSED' && canTransitionCallingStatus('PROPOSED', 'EXTENDED')) {
    return { toStatus: 'EXTENDED', label: 'Mark Extended' };
  }

  if (status === 'EXTENDED' && canTransitionCallingStatus('EXTENDED', 'SUSTAINED')) {
    return { toStatus: 'SUSTAINED', label: 'Mark Sustained' };
  }

  if (status === 'SUSTAINED' && canTransitionCallingStatus('SUSTAINED', 'SET_APART')) {
    return { toStatus: 'SET_APART', label: 'Mark Set Apart' };
  }

  return null;
}

export default async function CallingsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const wardId = session.activeWardId;
  const canManage = canManageCallings({ roles: session.user.roles, activeWardId: wardId }, wardId);

  async function transitionCalling(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageCallings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/callings');
    }

    const callingId = String(formData.get('callingId') ?? '').trim();
    const toStatus = String(formData.get('toStatus') ?? '').trim() as CallingStatus;
    if (!callingId || !toStatus) {
      redirect('/callings');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const currentStatus = await fetchCurrentCallingStatus(client, actionSession.activeWardId, callingId);
      if (!currentStatus) {
        await client.query('ROLLBACK');
        redirect('/callings');
        return;
      }

      const transition = await appendCallingStatus(client, {
        wardId: actionSession.activeWardId,
        callingId,
        fromStatus: currentStatus,
        toStatus
      });

      if (!transition.ok) {
        await client.query('ROLLBACK');
        redirect('/callings');
        return;
      }

      if (toStatus === 'SUSTAINED') {
        const assignmentResult = await client.query(
          'SELECT member_name, calling_name FROM calling_assignment WHERE id = $1 AND ward_id = $2 LIMIT 1',
          [callingId, actionSession.activeWardId]
        );
        const assignment = assignmentResult.rows[0] as { member_name: string; calling_name: string } | undefined;

        const meetingResult = await client.query(
          `SELECT id FROM meeting WHERE ward_id = $1 AND meeting_date >= CURRENT_DATE ORDER BY meeting_date ASC LIMIT 1 FOR UPDATE`,
          [actionSession.activeWardId]
        );

        if (meetingResult.rowCount && assignment) {
          await client.query(
            `INSERT INTO meeting_business_line (ward_id, meeting_id, member_name, calling_name, action_type, status)
             VALUES ($1, $2, $3, $4, 'SUSTAIN', 'pending')`,
            [actionSession.activeWardId, meetingResult.rows[0].id, assignment.member_name, assignment.calling_name]
          );
        }
      }

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, $3, jsonb_build_object('callingAssignmentId', $4, 'toStatus', $5))`,
        [actionSession.activeWardId, actionSession.user.id, `CALLING_${toStatus}`, callingId, toStatus]
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to transition calling');
    } finally {
      client.release();
    }

    revalidatePath('/callings');
  }

  // Fetch standard callings from DB for autocomplete, fall back to hardcoded list
  let standardCallings: string[] = STANDARD_CALLINGS;
  try {
    const scResult = await pool.query(
      `SELECT name FROM standard_calling WHERE is_active = true ORDER BY unit_type, sort_order, name`
    );
    if (scResult.rowCount && scResult.rowCount > 0) {
      standardCallings = scResult.rows.map((r) => r.name as string);
    }
  } catch {
    // Table may not exist yet; fall back to hardcoded list
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const callingResult = await client.query(
      `SELECT ca.id,
              ca.member_name,
              ca.calling_name,
              latest.action_status AS status,
              ca.created_at
         FROM calling_assignment ca
         JOIN LATERAL (
            SELECT action_status
              FROM calling_action
             WHERE calling_assignment_id = ca.id
               AND ward_id = ca.ward_id
             ORDER BY created_at DESC
             LIMIT 1
         ) latest ON TRUE
        WHERE ca.ward_id = $1
        ORDER BY ca.created_at DESC`,
      [wardId]
    );

    const setApartQueueResult = await client.query(
      `SELECT ca.id,
              ca.member_name,
              ca.calling_name,
              ca.created_at
         FROM calling_assignment ca
         JOIN LATERAL (
            SELECT action_status
              FROM calling_action
             WHERE calling_assignment_id = ca.id
               AND ward_id = ca.ward_id
             ORDER BY created_at DESC
             LIMIT 1
         ) latest ON TRUE
        WHERE ca.ward_id = $1
          AND ca.is_active = TRUE
          AND latest.action_status = 'SUSTAINED'
        ORDER BY ca.created_at ASC`,
      [wardId]
    );

    await client.query('COMMIT');

    const callings = callingResult.rows as CallingQueueRow[];
    const setApartQueue = setApartQueueResult.rows as Omit<CallingQueueRow, 'status'>[];

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Callings</h1>
            <p className="text-sm text-muted-foreground">Track proposed → extended → sustained → set apart lifecycle.</p>
          </div>
          {canManage ? (
            <Link href="/callings/standard" className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:underline">
              Manage Standard Callings
            </Link>
          ) : null}
        </section>

        {canManage ? (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-lg font-semibold">Add Calling</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Select from standard callings or type a custom calling name.
            </p>
            <AddCallingSection wardId={wardId} standardCallings={standardCallings} />
          </section>
        ) : null}

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Set Apart Queue</h2>
          <p className="mb-3 text-sm text-muted-foreground">Sustained callings awaiting set apart action.</p>
          {setApartQueue.length ? (
            <ul className="space-y-2">
              {setApartQueue.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{item.member_name}</span> — {item.calling_name}
                  </span>
                  {canManage ? (
                    <form action={transitionCalling}>
                      <input type="hidden" name="callingId" value={item.id} />
                      <input type="hidden" name="toStatus" value="SET_APART" />
                      <Button type="submit" size="sm" variant="outline">Mark Set Apart</Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No sustained callings are waiting for set apart.</p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Calling Assignments</h2>
          {callings.length ? (
            <ul className="mt-3 space-y-2">
              {callings.map((calling) => {
                const transition = canManage ? nextTransition(calling.status) : null;
                return (
                  <li key={calling.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold">{calling.member_name}</span> — {calling.calling_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                        {STATUS_LABELS[calling.status] ?? calling.status}
                      </span>
                      {transition ? (
                        <form action={transitionCalling}>
                          <input type="hidden" name="callingId" value={calling.id} />
                          <input type="hidden" name="toStatus" value={transition.toStatus} />
                          <Button type="submit" size="sm" variant="outline">{transition.label}</Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No calling assignments yet.</p>
          )}
        </section>
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load callings');
  } finally {
    client.release();
  }
}
