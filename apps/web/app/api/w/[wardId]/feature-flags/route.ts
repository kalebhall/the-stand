import { NextResponse } from 'next/server';

import { buildFieldDiff, recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { DEFAULT_WARD_FEATURE_FLAGS, WARD_FEATURES, type WardFeature } from '@/src/features/types';

const columns: Record<WardFeature, string> = {
  BISHOPRIC_AGENDA: 'bishopric_agenda',
  SCHEDULED_INTERVIEWS: 'scheduled_interviews',
  TECHNOLOGY_CHECKLIST: 'technology_checklist',
  SPEAKER_LIFECYCLE: 'speaker_lifecycle'
};

type FeatureRow = { bishopric_agenda: boolean; scheduled_interviews: boolean; technology_checklist: boolean; speaker_lifecycle: boolean };

function rowToFlags(row: FeatureRow | undefined) {
  return row ? {
    BISHOPRIC_AGENDA: row.bishopric_agenda,
    SCHEDULED_INTERVIEWS: row.scheduled_interviews,
    TECHNOLOGY_CHECKLIST: row.technology_checklist,
    SPEAKER_LIFECYCLE: row.speaker_lifecycle
  } : DEFAULT_WARD_FEATURE_FLAGS;
}

async function access(wardId: string, requireAdmin = false) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
  if (session.activeWardId !== wardId || (requireAdmin && !hasRole(session.user.roles, 'STAND_ADMIN'))) {
    return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const allowed = await access(wardId);
  if (allowed.response) return allowed.response;
  const result = await pool.query('SELECT bishopric_agenda, scheduled_interviews, technology_checklist, speaker_lifecycle FROM ward_feature_settings WHERE ward_id = $1::uuid LIMIT 1', [wardId]);
  return NextResponse.json({ features: rowToFlags(result.rows[0]) });
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const allowed = await access(wardId, true);
  if (allowed.response) return allowed.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || WARD_FEATURES.some((feature) => typeof body[feature] !== 'boolean')) {
    return NextResponse.json({ error: 'All feature values must be boolean', code: 'BAD_REQUEST' }, { status: 400 });
  }
  const values = Object.fromEntries(WARD_FEATURES.map((feature) => [columns[feature], body[feature]])) as FeatureRow;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: allowed.session.user.id, wardId });
    const beforeResult = await client.query('SELECT bishopric_agenda, scheduled_interviews, technology_checklist, speaker_lifecycle FROM ward_feature_settings WHERE ward_id = $1::uuid FOR UPDATE', [wardId]);
    const before = beforeResult.rows[0];
    const result = await client.query(`INSERT INTO ward_feature_settings (ward_id, bishopric_agenda, scheduled_interviews, technology_checklist, speaker_lifecycle, updated_by_user_id) VALUES ($1::uuid, $2::boolean, $3::boolean, $4::boolean, $5::boolean, $6::uuid) ON CONFLICT (ward_id) DO UPDATE SET bishopric_agenda = EXCLUDED.bishopric_agenda, scheduled_interviews = EXCLUDED.scheduled_interviews, technology_checklist = EXCLUDED.technology_checklist, speaker_lifecycle = EXCLUDED.speaker_lifecycle, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now() RETURNING bishopric_agenda, scheduled_interviews, technology_checklist, speaker_lifecycle`, [wardId, values.bishopric_agenda, values.scheduled_interviews, values.technology_checklist, values.speaker_lifecycle, allowed.session.user.id]);
    const after = result.rows[0];
    if (JSON.stringify(before ?? null) !== JSON.stringify(after)) {
      await recordAuditEvent(client, { wardId, userId: allowed.session.user.id, actorName: allowed.session.user.name || allowed.session.user.email || null, actorRole: allowed.session.user.roles?.[0] || null, action: 'WARD_FEATURES_UPDATED', entityType: 'ward_setting', entityId: wardId, changes: buildFieldDiff(before ? { ...before } : null, after, []), previousState: before ? { ...before } : null, details: { setting: 'ward_feature_settings' }, source: 'manual_ui', severity: 'notice' });
    }
    await client.query('COMMIT');
    return NextResponse.json({ features: rowToFlags(after) });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to save feature settings', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}
