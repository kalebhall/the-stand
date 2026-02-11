import type { PoolClient } from 'pg';

import { canTransitionCallingStatus, type CallingStatus } from '@/src/callings/lifecycle';

export async function fetchCurrentCallingStatus(client: PoolClient, wardId: string, callingId: string): Promise<CallingStatus | null> {
  const result = await client.query(
    `SELECT ca.id, latest.action_status
       FROM calling_assignment ca
       JOIN LATERAL (
          SELECT action_status
            FROM calling_action
           WHERE calling_assignment_id = ca.id
             AND ward_id = ca.ward_id
           ORDER BY created_at DESC
           LIMIT 1
       ) latest ON TRUE
      WHERE ca.id = $1 AND ca.ward_id = $2
      LIMIT 1
      FOR UPDATE`,
    [callingId, wardId]
  );

  if (!result.rowCount) {
    return null;
  }

  return result.rows[0].action_status as CallingStatus;
}

export async function appendCallingStatus(
  client: PoolClient,
  {
    wardId,
    callingId,
    fromStatus,
    toStatus
  }: { wardId: string; callingId: string; fromStatus: CallingStatus; toStatus: CallingStatus }
): Promise<{ ok: true } | { ok: false; reason: 'INVALID_TRANSITION' }> {
  if (!canTransitionCallingStatus(fromStatus, toStatus)) {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  await client.query(
    `INSERT INTO calling_action (ward_id, calling_assignment_id, action_status)
     VALUES ($1, $2, $3)`,
    [wardId, callingId, toStatus]
  );

  if (toStatus === 'SET_APART') {
    await client.query('UPDATE calling_assignment SET is_active = FALSE WHERE id = $1 AND ward_id = $2', [callingId, wardId]);
  }

  return { ok: true };
}
