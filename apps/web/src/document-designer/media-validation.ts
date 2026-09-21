import sharp from 'sharp';
import { MEDIA_MAX_BYTES, MEDIA_MAX_PIXELS, MEDIA_MIME_TYPES, type MediaMimeType } from './media-types';

export class MediaValidationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export type ValidatedMedia = {
  buffer: Buffer;
  mimeType: MediaMimeType;
  byteSize: number;
  width: number;
  height: number;
};

export async function validateAndNormalizeImage(input: { buffer: Buffer; declaredMimeType?: string | null }): Promise<ValidatedMedia> {
  if (input.buffer.byteLength === 0 || input.buffer.byteLength > MEDIA_MAX_BYTES) {
    throw new MediaValidationError('FILE_TOO_LARGE', 'Image exceeds the upload size limit.');
  }
  const image = sharp(input.buffer, { failOn: 'error', limitInputPixels: MEDIA_MAX_PIXELS });
  const metadata = await image.metadata().catch(() => { throw new MediaValidationError('INVALID_IMAGE', 'The uploaded file is not a valid image.'); });
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MEDIA_MAX_PIXELS) {
    throw new MediaValidationError('IMAGE_DIMENSIONS_INVALID', 'Image dimensions are outside the supported range.');
  }
  const detected = metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : metadata.format === 'webp' ? 'image/webp' : null;
  if (!detected || !MEDIA_MIME_TYPES.includes(detected)) {
    throw new MediaValidationError('UNSUPPORTED_FORMAT', 'Only JPEG, PNG, and WebP images are supported.');
  }
  if (input.declaredMimeType && input.declaredMimeType !== detected) {
    throw new MediaValidationError('MIME_MISMATCH', 'The declared MIME type does not match the image contents.');
  }
  const normalized = detected === 'image/jpeg' ? await image.jpeg({ mozjpeg: true }).toBuffer() : detected === 'image/png' ? await image.png().toBuffer() : await image.webp({ effort: 4 }).toBuffer();
  if (normalized.byteLength === 0 || normalized.byteLength > MEDIA_MAX_BYTES) {
    throw new MediaValidationError('FILE_TOO_LARGE', 'Normalized image exceeds the upload size limit.');
  }
  return { buffer: normalized, mimeType: detected, byteSize: normalized.byteLength, width: metadata.width, height: metadata.height };
}

export function validateMediaMetadata(input: { altText?: string | null; isDecorative?: boolean }): { altText: string | null; isDecorative: boolean } {
  const isDecorative = input.isDecorative === true;
  const altText = input.altText?.trim() || null;
  if (!isDecorative && !altText) throw new MediaValidationError('ALT_TEXT_REQUIRED', 'Non-decorative images require alt text.');
  if (altText && altText.length > 500) throw new MediaValidationError('ALT_TEXT_INVALID', 'Alt text is too long.');
  return { altText: isDecorative ? null : altText, isDecorative };
}
