export const PUBLIC_LAYOUT_PRESETS = ['SINGLE_SHEET_BIFOLD', 'TRI_FOLD_BULLETIN', 'FULL_PAGE'] as const;
export type PublicLayoutPreset = (typeof PUBLIC_LAYOUT_PRESETS)[number];
export const PUBLIC_ANNOUNCEMENT_MODES = ['NONE', 'AFTER_PROGRAM', 'BACK_PANEL'] as const;
export type PublicAnnouncementMode = (typeof PUBLIC_ANNOUNCEMENT_MODES)[number];
export const PUBLIC_COVER_MODES = ['NONE', 'AUTHORIZED_IMAGE'] as const;
export type PublicCoverMode = (typeof PUBLIC_COVER_MODES)[number];

export function validatePublicLayout(value: { preset: string; announcementMode: string; coverMode: string }): string | null {
  if (!PUBLIC_LAYOUT_PRESETS.includes(value.preset as PublicLayoutPreset)) return 'Unsupported public layout preset.';
  if (!PUBLIC_ANNOUNCEMENT_MODES.includes(value.announcementMode as PublicAnnouncementMode)) return 'Unsupported announcement mode.';
  if (!PUBLIC_COVER_MODES.includes(value.coverMode as PublicCoverMode)) return 'Unsupported cover mode.';
  return null;
}
