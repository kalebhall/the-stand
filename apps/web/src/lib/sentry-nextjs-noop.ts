export const init = (_options?: unknown): void => {};

export const captureException = (_error: unknown): string => 'sentry-disabled';

export const captureMessage = (_message: string): string => 'sentry-disabled';

export const setUser = (_user: unknown): void => {};

export const setContext = (_name: string, _context: unknown): void => {};

export const setTag = (_key: string, _value: string): void => {};

export const addBreadcrumb = (_breadcrumb: unknown): void => {};

export const withScope = (callback: (scope: unknown) => void): void => {
  callback({});
};

export const startSpan = async <T>(_options: unknown, callback: () => Promise<T> | T): Promise<T> => callback();

export const startSpanManual = async <T>(_options: unknown, callback: () => Promise<T> | T): Promise<T> => callback();

export const flush = async (_timeout?: number): Promise<boolean> => true;

export const close = async (_timeout?: number): Promise<boolean> => true;

export const replayIntegration = (): null => null;

export const browserTracingIntegration = (): null => null;

export const getTraceData = (): Record<string, string> => ({});

export const withServerActionInstrumentation = async <T>(_name: string, callback: () => Promise<T> | T): Promise<T> => callback();

export const withRouteHandlerInstrumentation = async <T>(_name: string, callback: () => Promise<T> | T): Promise<T> => callback();

const noopSentry = {
  init,
  captureException,
  captureMessage,
  setUser,
  setContext,
  setTag,
  addBreadcrumb,
  withScope,
  startSpan,
  startSpanManual,
  flush,
  close,
  replayIntegration,
  browserTracingIntegration,
  getTraceData,
  withServerActionInstrumentation,
  withRouteHandlerInstrumentation
};

export default noopSentry;
