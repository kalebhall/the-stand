import { pool } from './client';

type AuditDetails = Record<string, unknown>;

export async function logAuditAction(input: {
  action: string;
  actorUserId: string | null;
  wardId?: string | null;
  details?: AuditDetails;
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [input.wardId ?? null, input.actorUserId, input.action, input.details ? JSON.stringify(input.details) : null]
  );
}
