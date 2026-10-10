import sharp from 'sharp';
import { MEDIA_MAX_BYTES, MEDIA_MAX_PIXELS, MEDIA_MIME_TYPES, type MediaMimeType } from './media-types';
import { MediaValidationError } from './media-metadata-validation';
export { MediaValidationError, validateMediaMetadata } from './media-metadata-validation';

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
  const metadata = await image.metadata().catch(() => {
    throw new MediaValidationError('INVALID_IMAGE', 'The uploaded file is not a valid image.');
  });
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MEDIA_MAX_PIXELS) {
    throw new MediaValidationError('IMAGE_DIMENSIONS_INVALID', 'Image dimensions are outside the supported range.');
  }
  const detected =
    metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : metadata.format === 'webp' ? 'image/webp' : null;
  if (!detected || !MEDIA_MIME_TYPES.includes(detected)) {
    throw new MediaValidationError('UNSUPPORTED_FORMAT', 'Only JPEG, PNG, and WebP images are supported.');
  }
  if (input.declaredMimeType && input.declaredMimeType !== detected) {
    throw new MediaValidationError('MIME_MISMATCH', 'The declared MIME type does not match the image contents.');
  }
  const normalized =
    detected === 'image/jpeg'
      ? await image.jpeg({ mozjpeg: true }).toBuffer()
      : detected === 'image/png'
        ? await image.png().toBuffer()
        : await image.webp({ effort: 4 }).toBuffer();
  if (normalized.byteLength === 0 || normalized.byteLength > MEDIA_MAX_BYTES) {
    throw new MediaValidationError('FILE_TOO_LARGE', 'Normalized image exceeds the upload size limit.');
  }
  return { buffer: normalized, mimeType: detected, byteSize: normalized.byteLength, width: metadata.width, height: metadata.height };
}
