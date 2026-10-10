export class MediaValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function validateMediaMetadata(input: { altText?: string | null; isDecorative?: boolean }): {
  altText: string | null;
  isDecorative: boolean;
} {
  const isDecorative = input.isDecorative === true;
  const altText = input.altText?.trim() || null;
  if (!isDecorative && !altText) throw new MediaValidationError('ALT_TEXT_REQUIRED', 'Non-decorative images require alt text.');
  if (altText && altText.length > 500) throw new MediaValidationError('ALT_TEXT_INVALID', 'Alt text is too long.');
  return { altText: isDecorative ? null : altText, isDecorative };
}
