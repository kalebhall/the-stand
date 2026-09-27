import type { PoolClient } from 'pg';

import { getCallingLcrFollowUp } from './calling-follow-up';
import type { CallingStatus } from '@/src/callings/lifecycle';
import { insertNotificationOutboxEvent } from '@/src/notifications/outbox';

const RECORD_CALLINGS_URL = 'https://www.churchofjesuschrist.org/tools/help/record-callings?lang=eng';

export async function persistCallingLcrFollowUp(
  client: Pick<PoolClient, 'query'>,
  { wardId, callingId, status }: { wardId: string; callingId: string; status: CallingStatus }
): Promise<void> {
  const followUp = getCallingLcrFollowUp(status);
  if (!followUp) return;

  const assignment = await client.query(
    `SELECT member_name, calling_name
       FROM calling_assignment
      WHERE id = $1::uuid AND ward_id = $2::uuid
      LIMIT 1`,
    [callingId, wardId]
  );
  const row = assignment?.rows?.[0] as { member_name?: string | null; calling_name?: string | null } | undefined;
  if (!row?.member_name) return;

  await client.query(
    `INSERT INTO church_action_follow_up
      (ward_id, family, action_type, status, member_name, calling_assignment_id,
       source_event, source_event_id, description, official_system, official_reference_url)
     VALUES ($1::uuid, 'CALLING', $2::text, 'OPEN', $3::text, $4::uuid,
       $5::text, $4::uuid, $6::text, 'LCR', $7::text)
     ON CONFLICT (ward_id, action_type, source_event_id)
     DO UPDATE SET
       member_name = EXCLUDED.member_name,
       description = EXCLUDED.description,
       official_reference_url = EXCLUDED.official_reference_url,
       updated_at = now(),
       status = CASE WHEN church_action_follow_up.status = 'COMPLETED' THEN church_action_follow_up.status ELSE 'OPEN' END`,
    [
      wardId,
      followUp.actionType,
      row.member_name,
      callingId,
      `CALLING_${status}`,
      `Record follow-up: ${followUp.title}${row.calling_name ? ` — ${row.calling_name}` : ''}`,
      RECORD_CALLINGS_URL
    ]
  );
  await insertNotificationOutboxEvent(client, {
    wardId,
    aggregateType: 'calling_assignment',
    aggregateId: callingId,
    eventType: 'CALLING_REQUIRES_FOLLOW_UP',
    payload: {
      callingId,
      memberName: row.member_name,
      callingName: row.calling_name,
      actionType: followUp.actionType,
      sourceEvent: `CALLING_${status}`
    }
  });
}
