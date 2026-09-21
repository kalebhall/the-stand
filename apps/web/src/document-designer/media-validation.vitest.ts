import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { validateAndNormalizeImage, validateMediaMetadata, MediaValidationError } from './media-validation';

describe('media validation', () => {
  it('sniffs and normalizes supported images instead of trusting the filename or MIME', async () => {
    const input = await sharp({ create: { width: 40, height: 30, channels: 3, background: 'white' } }).png().toBuffer();
    const result = await validateAndNormalizeImage({ buffer: input, declaredMimeType: 'image/png' });
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(40);
    expect(result.height).toBe(30);
    expect(result.byteSize).toBeGreaterThan(0);
  });

  it('rejects spoofed MIME and missing alt text for non-decorative images', async () => {
    const input = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
    await expect(validateAndNormalizeImage({ buffer: input, declaredMimeType: 'image/jpeg' })).rejects.toMatchObject({ code: 'MIME_MISMATCH' });
    expect(() => validateMediaMetadata({ isDecorative: false })).toThrowError(MediaValidationError);
    expect(validateMediaMetadata({ isDecorative: true })).toEqual({ altText: null, isDecorative: true });
  });
});
