export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

type LogMethod = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function normalizeLogLevel(value: string | undefined): LogLevel {
  if (!value) {
    return 'info';
  }

  const normalized = value.toLowerCase();
  if (LOG_LEVELS.includes(normalized as LogLevel)) {
    return normalized as LogLevel;
  }

  return 'info';
}

function shouldLog(method: LogMethod, configuredLevel: LogLevel): boolean {
  return LOG_LEVEL_RANK[method] >= LOG_LEVEL_RANK[configuredLevel];
}

function formatMessage(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

export function getConfiguredLogLevel(): LogLevel {
  return normalizeLogLevel(process.env.LOG_LEVEL);
}

export function createLogger(scope: string) {
  const configuredLevel = getConfiguredLogLevel();

  return {
    debug(message: string, metadata?: unknown) {
      if (!shouldLog('debug', configuredLevel)) {
        return;
      }
      console.debug(formatMessage(scope, message), metadata ?? '');
    },
    info(message: string, metadata?: unknown) {
      if (!shouldLog('info', configuredLevel)) {
        return;
      }
      console.info(formatMessage(scope, message), metadata ?? '');
    },
    warn(message: string, metadata?: unknown) {
      if (!shouldLog('warn', configuredLevel)) {
        return;
      }
      console.warn(formatMessage(scope, message), metadata ?? '');
    },
    error(message: string, metadata?: unknown) {
      if (!shouldLog('error', configuredLevel)) {
        return;
      }
      console.error(formatMessage(scope, message), metadata ?? '');
    }
  };
}
