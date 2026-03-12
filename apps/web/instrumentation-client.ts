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
    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,
  
    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,
  
    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,
  
    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
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
