const sentryPackageName = '@sentry/nextjs';

const toBoolean = (value: string | undefined) => value?.toLowerCase() === 'true';

export const isSentryEnabled = (): boolean => toBoolean(process.env.SENTRY_ENABLED);

export const getSentryServerDsn = (): string | undefined => process.env.SENTRY_DSN;

export const getSentryClientDsn = (): string | undefined => process.env.NEXT_PUBLIC_SENTRY_DSN;

export const loadSentrySdk = async (): Promise<any | null> => {
  if (!isSentryEnabled()) {
    return null;
  }

  try {
    return await import(sentryPackageName);
  } catch {
    return null;
  }
};
