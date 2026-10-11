import type { RedisOptions } from 'ioredis';

function parseInteger(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('REDIS_URL contains an invalid numeric option.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('REDIS_URL contains an invalid numeric option.');
  return parsed;
}

function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error('REDIS_URL contains malformed credentials.');
  }
}

/** Convert a Redis URL to options so ioredis does not call deprecated url.parse(). */
export function parseRedisConnectionUrl(connectionString: string): RedisOptions {
  const value = connectionString.trim();
  if (/^\d+$/.test(value)) return { port: parseInteger(value) };
  if (value.startsWith('/')) return { path: value };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL.');
  }
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://.');
  }

  const options: RedisOptions = {};
  if (url.username || url.password) {
    options.username = decodeCredential(url.username);
    options.password = decodeCredential(url.password);
  }
  if (url.hostname) options.host = url.hostname;
  if (url.port) options.port = parseInteger(url.port);
  if (url.pathname.length > 1) options.db = parseInteger(url.pathname.slice(1));
  if (url.protocol === 'rediss:') options.tls = {};

  const seenKeys = new Set<string>();
  for (const [key, queryValue] of url.searchParams) {
    if (seenKeys.has(key)) throw new Error('REDIS_URL contains a repeated query option.');
    seenKeys.add(key);
    switch (key) {
      case 'family':
        if (options.family === undefined) options.family = parseInteger(queryValue);
        break;
      case 'connectTimeout':
        if (options.connectTimeout === undefined) options.connectTimeout = parseInteger(queryValue);
        break;
      case 'maxRetriesPerRequest':
        if (options.maxRetriesPerRequest === undefined) {
          options.maxRetriesPerRequest = queryValue === 'null' ? null : parseInteger(queryValue);
        }
        break;
      default:
        throw new Error('REDIS_URL contains an unsupported query option.');
    }
  }

  return options;
}
