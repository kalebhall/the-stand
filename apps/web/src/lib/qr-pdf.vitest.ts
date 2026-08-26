import { describe, expect, it } from 'vitest';

import { createPortalPdfDoc, generateQrDataUrl, sanitizePdfFilename } from './qr-pdf';

describe('qr-pdf generation utilities', () => {
  it('generates a valid QR data URL', async () => {
    const url = 'https://thestand.app/p/ward/sample-token-123';
    const dataUrl = await generateQrDataUrl(url);

    expect(dataUrl).toBeTypeOf('string');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('creates a single-page letter PDF doc with correct metadata', async () => {
    const doc = await createPortalPdfDoc({
      wardName: 'Freedom Park Ward',
      title: 'Digital Program',
      url: 'https://thestand.app/p/ward/sample-token-123'
    });

    expect(doc.getNumberOfPages()).toBe(1);
    const pageSize = doc.internal.pageSize;
    // Letter dimensions in mm: ~215.9 x 279.4
    expect(Math.round(pageSize.getWidth())).toBe(216);
    expect(Math.round(pageSize.getHeight())).toBe(279);
  });

  it('handles long ward names gracefully by scaling font size', async () => {
    const doc = await createPortalPdfDoc({
      wardName: 'A Very Long Ward Name With Many Words And Central Stake Designation Unit 85510',
      title: 'Digital Program',
      url: 'https://thestand.app/p/ward/token-long'
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('sanitizes PDF filenames correctly', () => {
    expect(sanitizePdfFilename('Freedom Park Ward')).toBe('freedom-park-ward-digital-program.pdf');
    expect(sanitizePdfFilename('Las Vegas 1st Ward (Spanish)')).toBe('las-vegas-1st-ward-spanish-digital-program.pdf');
    expect(sanitizePdfFilename('Special / Characters & Names!')).toBe('special-characters-names-digital-program.pdf');
    expect(sanitizePdfFilename('')).toBe('ward-digital-program.pdf');
  });
});
