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

// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://763e0ccc92efb8cef53b138ae12dc32d@o4511032266981376.ingest.us.sentry.io/4511032286642176",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
