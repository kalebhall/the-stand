export const MEDIA_SCOPE_TYPES = ['SYSTEM', 'STAKE', 'WARD'] as const;
export type MediaScopeType = (typeof MEDIA_SCOPE_TYPES)[number];

export const MEDIA_STATUSES = ['ACTIVE', 'ARCHIVED', 'QUARANTINED'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_MAX_PIXELS = 25_000_000;

export type MediaAsset = {
  id: string;
  scope_type: MediaScopeType;
  ward_id: string | null;
  stake_id: string | null;
  owner_user_id: string | null;
  storage_key: string;
  public_token: string | null;
  filename: string;
  mime_type: MediaMimeType;
  byte_size: number;
  pixel_width: number;
  pixel_height: number;
  alt_text: string | null;
  is_decorative: boolean;
  status: MediaStatus;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type MediaAssetResponse = Omit<MediaAsset, 'storage_key' | 'public_token'> & {
  url: string | null;
};
