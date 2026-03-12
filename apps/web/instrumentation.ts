import { getSentryServerDsn, isSentryEnabled, loadSentrySdk } from '@/src/lib/sentry';

const initializeSentryForRuntime = async (): Promise<void> => {
  if (!isSentryEnabled() || !getSentryServerDsn()) {
    return;
  }

  const sdk = await loadSentrySdk();

  if (!sdk?.init) {
    return;
  }

  sdk.init({
    dsn: getSentryServerDsn(),
    enabled: true,
    tracesSampleRate: 1
  });
};

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await initializeSentryForRuntime();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await initializeSentryForRuntime();
  }
}
