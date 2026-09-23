export const PLATFORM_ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  WARD_ACCESS_DENIED: 'WARD_ACCESS_DENIED',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL'
} as const;

export type PlatformErrorCode = (typeof PLATFORM_ERROR_CODES)[keyof typeof PLATFORM_ERROR_CODES];

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  readonly status: number;

  constructor(code: PlatformErrorCode, message: string, status: number) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
    this.status = status;
  }
}

export function wardAccessDenied(wardId: string): PlatformError {
  return new PlatformError(
    PLATFORM_ERROR_CODES.WARD_ACCESS_DENIED,
    `Access denied for ward ${wardId}.`,
    403
  );
}

export function toPlatformError(error: unknown): PlatformError {
  if (error instanceof PlatformError) return error;
  return new PlatformError(PLATFORM_ERROR_CODES.INTERNAL, 'An internal error occurred.', 500);
}

export type PlatformErrorResponse = {
  error: string;
  code: PlatformErrorCode;
};

export function toPlatformErrorResponse(error: unknown): PlatformErrorResponse {
  const platformError = toPlatformError(error);
  return { error: platformError.message, code: platformError.code };
}
