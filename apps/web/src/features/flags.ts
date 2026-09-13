import { pool } from '@/src/db/client';
import { DEFAULT_WARD_FEATURE_FLAGS, type WardFeature, type WardFeatureFlags } from './types';
export { DEFAULT_WARD_FEATURE_FLAGS, WARD_FEATURES, WARD_FEATURE_LABELS, type WardFeature, type WardFeatureFlags } from './types';

type FeatureRow = { bishopric_agenda: boolean; scheduled_interviews: boolean; technology_checklist: boolean; speaker_lifecycle: boolean };

function toFlags(row: FeatureRow | undefined): WardFeatureFlags {
  return row ? {
    BISHOPRIC_AGENDA: row.bishopric_agenda,
    SCHEDULED_INTERVIEWS: row.scheduled_interviews,
    TECHNOLOGY_CHECKLIST: row.technology_checklist,
    SPEAKER_LIFECYCLE: row.speaker_lifecycle
  } : DEFAULT_WARD_FEATURE_FLAGS;
}

export async function getWardFeatureFlags(wardId: string): Promise<WardFeatureFlags> {
  const result = await pool.query(`SELECT bishopric_agenda, scheduled_interviews, technology_checklist, speaker_lifecycle FROM ward_feature_settings WHERE ward_id = $1::uuid LIMIT 1`, [wardId]);
  return toFlags(result.rows[0]);
}

export async function isWardFeatureEnabled(wardId: string, feature: WardFeature): Promise<boolean> {
  const flags = await getWardFeatureFlags(wardId);
  return flags[feature];
}

export function featureIsEnabled(flags: WardFeatureFlags, feature: WardFeature): boolean {
  return flags[feature];
}
