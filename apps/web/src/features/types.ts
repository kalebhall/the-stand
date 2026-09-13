export const WARD_FEATURES = ['BISHOPRIC_AGENDA', 'SCHEDULED_INTERVIEWS', 'TECHNOLOGY_CHECKLIST', 'SPEAKER_LIFECYCLE'] as const;
export type WardFeature = (typeof WARD_FEATURES)[number];
export type WardFeatureFlags = Record<WardFeature, boolean>;

export const DEFAULT_WARD_FEATURE_FLAGS: WardFeatureFlags = {
  BISHOPRIC_AGENDA: true,
  SCHEDULED_INTERVIEWS: true,
  TECHNOLOGY_CHECKLIST: true,
  SPEAKER_LIFECYCLE: true
};

export const WARD_FEATURE_LABELS: Record<WardFeature, { label: string; description: string }> = {
  BISHOPRIC_AGENDA: { label: 'Bishopric agenda', description: 'Private bishopric, ward council, and missionary coordination workspaces.' },
  SCHEDULED_INTERVIEWS: { label: 'Scheduled interviews', description: 'Operational interview scheduling and calendar exports.' },
  TECHNOLOGY_CHECKLIST: { label: 'Technology checklist', description: 'Meeting technology readiness checklists and reminders.' },
  SPEAKER_LIFECYCLE: { label: 'Speaker lifecycle', description: 'Speaker topic and planned, invited, accepted, confirmed, completed status tracking.' }
};
