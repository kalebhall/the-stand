import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

import { AddCallingSection } from '@/components/AddCallingSection';
import { CallingAssignButton } from '@/components/CallingAssignButton';
import { CallingDeleteButton } from '@/components/CallingDeleteButton';
import { CallingReleaseButton } from '@/components/CallingReleaseButton';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageCallings, canViewCallings, hasRole } from '@/src/auth/roles';
import { canTransitionCallingStatus, type CallingStatus } from '@/src/callings/lifecycle';
import { queueCallingBusinessLine } from '@/src/callings/meeting-business';
import { STANDARD_CALLINGS } from '@/src/callings/standard-callings';
import { appendCallingStatus, fetchCurrentCallingStatus } from '@/src/callings/transition';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { getCallingNotificationEventType } from '@/src/notifications/calling-events';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { isWardModuleEnabled } from '@/src/modules/service';
import { requireWardModuleEnabled } from '@/src/modules/action-guard';

type CallingQueueRow = {
  id: string;
  member_name: string;
  organization: string | null;
  calling_name: string;
  status: string;
  sustained_date: string | null;
  created_at: string;
};

type Translator = (key: string, values?: Record<string, string | number>) => string;

function formatCallingTenure(sustainedDate: string | null, createdAt: string, t: Translator): string {
  const start = sustainedDate ? new Date(`${sustainedDate}T00:00:00.000Z`) : new Date(createdAt);
  if (Number.isNaN(start.getTime())) {
    return t('months', { count: 0 });
  }

  const now = new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const nowDay = now.getUTCDate();

  let months = (nowYear - start.getUTCFullYear()) * 12 + (nowMonth - start.getUTCMonth());
  if (nowDay < start.getUTCDate()) {
    months -= 1;
  }

  const totalMonths = Math.max(0, months);
  const years = Math.floor(totalMonths / 12);
  const remainderMonths = totalMonths % 12;

  if (years === 0) {
    return t('months', { count: remainderMonths });
  }

  if (remainderMonths === 0) {
    return t('years', { count: years });
  }

  return t('tenureYearsMonths', { years, months: remainderMonths });
}

function nextTransition(status: string): { toStatus: CallingStatus; labelKey: string } | null {
  if (status === 'PROPOSED' && canTransitionCallingStatus('PROPOSED', 'EXTENDED')) {
    return { toStatus: 'EXTENDED', labelKey: 'markExtended' };
  }

  if (status === 'EXTENDED' && canTransitionCallingStatus('EXTENDED', 'SUSTAINED')) {
    return { toStatus: 'SUSTAINED', labelKey: 'markSustained' };
  }

  if (status === 'SUSTAINED' && canTransitionCallingStatus('SUSTAINED', 'SET_APART')) {
    return { toStatus: 'SET_APART', labelKey: 'markSetApart' };
  }

  return null;
}

type CallingSortRow = Pick<CallingQueueRow, 'member_name' | 'organization' | 'calling_name'>;

function callingPriority(callingName: string): number {
  const name = callingName.toLowerCase();
  if (name.includes('president')) return 0;
  if (name.includes('first counselor')) return 1;
  if (name.includes('second counselor')) return 2;
  if (name.includes('secretary')) return 3;
  return 4;
}

function compareCallings(left: CallingSortRow, right: CallingSortRow): number {
  const groupCompare = (left.organization ?? '').localeCompare(right.organization ?? '');
  if (groupCompare !== 0) return groupCompare;
  const priorityCompare = callingPriority(left.calling_name) - callingPriority(right.calling_name);
  if (priorityCompare !== 0) return priorityCompare;
  const callingCompare = left.calling_name.localeCompare(right.calling_name);
  return callingCompare !== 0 ? callingCompare : left.member_name.localeCompare(right.member_name);
}

export default async function CallingsPage() {
  const t = await getTranslations('callings');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'callings')) || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const wardId = session.activeWardId;
  const canManage = canManageCallings({ roles: session.user.roles, activeWardId: wardId }, wardId);
  const canManageStandardCatalog = hasRole(session.user.roles, 'SUPPORT_ADMIN') || hasRole(session.user.roles, 'SYSTEM_ADMIN');

  async function transitionCalling(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);
    if (actionSession.activeWardId) {
      await requireWardModuleEnabled(actionSession.activeWardId, actionSession.user.id, 'callings', '/callings');
    }

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

      if (toStatus === 'EXTENDED') {
        // Queue the sustain line when the calling is extended. The later SUSTAINED transition
        // must not create a duplicate line.
        await queueCallingBusinessLine(client, {
          wardId: actionSession.activeWardId,
          callingId,
          actionType: 'SUSTAIN'
        });
      }

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1::uuid, $2::uuid, $3::text, jsonb_build_object('callingAssignmentId', $4::text, 'toStatus', $5::text))`,
        [actionSession.activeWardId, actionSession.user.id, `CALLING_${toStatus}`, callingId, toStatus]
      );

      const notificationEventType = getCallingNotificationEventType(toStatus);
      const eventOutboxId = notificationEventType
        ? await insertNotificationOutboxEvent(client, {
            wardId: actionSession.activeWardId,
            aggregateType: 'calling_assignment',
            aggregateId: callingId,
            eventType: notificationEventType,
            payload: {
              actorUserId: actionSession.user.id,
              callingAssignmentId: callingId,
              status: toStatus
            }
          })
        : null;

      await client.query('COMMIT');
      enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, actionSession.activeWardId, eventOutboxId);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[callings transitionCalling]', err instanceof Error ? err.message : String(err));
      throw new Error(t('failedToTransition'));
    } finally {
      client.release();
    }

    revalidatePath('/callings');
  }

  // Fetch standard callings from DB for autocomplete, fall back to hardcoded list
  let standardCallings: string[] = STANDARD_CALLINGS;
  try {
    const scResult = await pool.query(`SELECT name FROM standard_calling WHERE is_active = true AND unit_type = 'ward' ORDER BY sort_order, name`);
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
              COALESCE(NULLIF(ca.organization, ''), sc.organization, '') AS organization,
              ca.calling_name,
              latest.action_status AS status,
              ca.sustained_date,
              ca.created_at
         FROM calling_assignment ca
         LEFT JOIN standard_calling sc ON sc.name = ca.calling_name
         JOIN LATERAL (
            SELECT action_status
              FROM calling_action
             WHERE calling_assignment_id = ca.id
               AND ward_id = ca.ward_id
             ORDER BY created_at DESC
             LIMIT 1
         ) latest ON TRUE
        WHERE ca.ward_id = $1
        ORDER BY ca.member_name ASC`,
      [wardId]
    );

    const setApartQueueResult = await client.query(
      `SELECT ca.id,
              ca.member_name,
              COALESCE(NULLIF(ca.organization, ''), sc.organization, '') AS organization,
              ca.calling_name,
              ca.sustained_date,
              ca.created_at
         FROM calling_assignment ca
         LEFT JOIN standard_calling sc ON sc.name = ca.calling_name
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

    const allCallings = callingResult.rows as CallingQueueRow[];
    const setApartQueue = setApartQueueResult.rows as Omit<CallingQueueRow, 'status'>[];
    const sortedSetApartQueue = [...setApartQueue].sort(compareCallings);

    // Split callings into sections
    const proposedCallings = allCallings.filter((c) => c.status === 'PROPOSED');
    const extendedCallings = allCallings.filter((c) => c.status === 'EXTENDED');
    const toBeReleasedCallings = allCallings.filter((c) => c.status === 'TO_BE_RELEASED');
    const activeCallings = allCallings.filter((c) => c.status !== 'PROPOSED' && c.status !== 'EXTENDED' && c.status !== 'TO_BE_RELEASED');

    function CallingRow({ calling, showRelease = true }: { calling: CallingQueueRow; showRelease?: boolean }) {
      const transition = canManage ? nextTransition(calling.status) : null;
      return (
        <li className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span>
            <span className="font-semibold">{calling.member_name}</span> — {calling.calling_name}
            <span className="ml-2 text-xs text-muted-foreground">
              {t('inCalling', { tenure: formatCallingTenure(calling.sustained_date, calling.created_at, t) })}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{t(`status_${calling.status}`)}</span>
            {transition ? (
              <form action={transitionCalling}>
                <input type="hidden" name="callingId" value={calling.id} />
                <input type="hidden" name="toStatus" value={transition.toStatus} />
                <Button type="submit" size="sm" variant="outline">
                  {t(transition.labelKey)}
                </Button>
              </form>
            ) : null}
            {canManage && calling.status !== 'ASSIGNED' && calling.status !== 'SET_APART' && calling.status !== 'TO_BE_RELEASED' ? (
              <CallingAssignButton
                wardId={wardId}
                callingId={calling.id}
                memberName={calling.member_name}
                callingName={calling.calling_name}
              />
            ) : null}
            {canManage && showRelease && calling.status !== 'TO_BE_RELEASED' ? (
              <CallingReleaseButton
                wardId={wardId}
                callingId={calling.id}
                memberName={calling.member_name}
                callingName={calling.calling_name}
              />
            ) : null}
            {canManage && (calling.status === 'PROPOSED' || calling.status === 'EXTENDED' || calling.status === 'TO_BE_RELEASED') ? (
              <CallingDeleteButton
                wardId={wardId}
                callingId={calling.id}
                memberName={calling.member_name}
                callingName={calling.calling_name}
              />
            ) : null}
          </div>
        </li>
      );
    }

    function CallingGroups({ callings, showRelease = true }: { callings: CallingQueueRow[]; showRelease?: boolean }) {
      const groups = new Map<string, CallingQueueRow[]>();
      for (const calling of [...callings].sort(compareCallings)) {
        const group = calling.organization || t('other');
        groups.set(group, [...(groups.get(group) ?? []), calling]);
      }

      return <div className="space-y-4">{Array.from(groups, ([group, groupedCallings]) => (
        <section key={group} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
          <ul className="space-y-2">{groupedCallings.map((calling) => <CallingRow key={calling.id} calling={calling} showRelease={showRelease} />)}</ul>
        </section>
      ))}</div>;
    }

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage ? (
              <Link href="/imports/callings" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                {t('importCallings')}
              </Link>
            ) : null}
            {canManageStandardCatalog ? (
              <Link href="/callings/standard" className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:underline">
                {t('manageStandardCallings')}
              </Link>
            ) : null}
          </div>
        </section>

        {canManage ? (
          <section className="section-panel section-panel--service rounded-lg border bg-card p-4">
            <h2 className="text-lg font-semibold">{t('addCalling')}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{t('addCallingDescription')}</p>
            <AddCallingSection wardId={wardId} standardCallings={standardCallings} />
          </section>
        ) : null}

        {/* Proposed section */}
        <section className="section-panel section-panel--service rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">{t('proposed')}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('proposedDescription')}</p>
          {proposedCallings.length ? (
            <CallingGroups callings={proposedCallings} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('noProposed')}</p>
          )}
        </section>

        {/* Extended section */}
        <section className="section-panel section-panel--service rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">{t('extended')}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('extendedDescription')}</p>
          {extendedCallings.length ? (
            <CallingGroups callings={extendedCallings} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('noExtended')}</p>
          )}
        </section>

        {/* To Be Released section */}
        <section className="section-panel section-panel--service rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">{t('toBeReleased')}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('toBeReleasedDescription')}</p>
          {toBeReleasedCallings.length ? (
            <CallingGroups callings={toBeReleasedCallings} showRelease={false} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('noToBeReleased')}</p>
          )}
        </section>

        {/* Set Apart Queue */}
        <section className="section-panel section-panel--service rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">{t('setApartQueue')}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('setApartQueueDescription')}</p>
          {setApartQueue.length ? (
            <ul className="space-y-2">
              {sortedSetApartQueue.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{item.member_name}</span> — {item.calling_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('inCalling', { tenure: formatCallingTenure(item.sustained_date, item.created_at, t) })}
                    </span>
                  </span>
                  {canManage ? (
                    <form action={transitionCalling}>
                      <input type="hidden" name="callingId" value={item.id} />
                      <input type="hidden" name="toStatus" value="SET_APART" />
                      <Button type="submit" size="sm" variant="outline">
                        {t('markSetApart')}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noSetApartQueue')}</p>
          )}
        </section>

        {/* All Calling Assignments (excluding proposed, extended, to be released) */}
        <section className="section-panel section-panel--service rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">{t('assignments')}</h2>
          {activeCallings.length ? (
            <div className="mt-3"><CallingGroups callings={activeCallings} /></div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t('noAssignments')}</p>
          )}
        </section>
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error(t('failedToLoad'));
  } finally {
    client.release();
  }
}
