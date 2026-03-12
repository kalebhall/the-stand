'use client';

import { getSentryClientDsn, isSentryEnabled, loadSentrySdk } from '@/src/lib/sentry';

const initializeSentryClient = async (): Promise<void> => {
  if (!isSentryEnabled() || !getSentryClientDsn()) {
    return;
  }

  const sdk = await loadSentrySdk();

  if (!sdk?.init) {
    return;
  }

  sdk.init({
    dsn: getSentryClientDsn(),
    enabled: true,
    tracesSampleRate: 1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1
  });
};

void initializeSentryClient();
