import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type CallingQueueRow = {
  id: string;
  member_name: string;
  calling_name: string;
  status: string;
  created_at: string;
};

export default async function CallingsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

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
      [session.activeWardId]
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
      [session.activeWardId]
    );

    await client.query('COMMIT');

    const callings = callingResult.rows as CallingQueueRow[];
    const setApartQueue = setApartQueueResult.rows as Omit<CallingQueueRow, 'status'>[];

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Callings</h1>
          <p className="text-sm text-muted-foreground">Track proposed → extended → sustained → set apart lifecycle.</p>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Set Apart Queue</h2>
          <p className="mb-3 text-sm text-muted-foreground">Sustained callings awaiting set apart action.</p>
          {setApartQueue.length ? (
            <ul className="space-y-2">
              {setApartQueue.map((item) => (
                <li key={item.id} className="rounded-md border px-3 py-2 text-sm">
                  <span className="font-semibold">{item.member_name}</span> — {item.calling_name}
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
              {callings.map((calling) => (
                <li key={calling.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{calling.member_name}</span> — {calling.calling_name}
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{calling.status}</span>
                </li>
              ))}
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
