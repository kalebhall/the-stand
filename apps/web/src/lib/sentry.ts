type SentrySdk = {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown) => void;
};

function isSentrySdk(value: unknown): value is SentrySdk {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.init === undefined || typeof candidate.init === 'function') &&
    (candidate.captureException === undefined || typeof candidate.captureException === 'function')
  );
}

const toBoolean = (value: string | undefined) => value?.toLowerCase() === 'true';

export const isSentryEnabled = (): boolean => toBoolean(process.env.SENTRY_ENABLED);

export const getSentryServerDsn = (): string | undefined => process.env.SENTRY_DSN;

export const getSentryClientDsn = (): string | undefined => process.env.NEXT_PUBLIC_SENTRY_DSN;

export const loadSentrySdk = async (): Promise<SentrySdk | null> => {
  if (!isSentryEnabled()) {
    return null;
  }

  try {
    const module = await import('@sentry/nextjs');
    const candidate = module.default ?? module;
    return isSentrySdk(candidate) ? candidate : null;
  } catch {
    return null;
  }
};
