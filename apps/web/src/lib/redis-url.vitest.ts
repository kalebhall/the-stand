import { describe, expect, it } from 'vitest';
import { parseRedisConnectionUrl } from './redis-url';

describe('parseRedisConnectionUrl', () => {
  it('parses redis host, credentials, database, and supported query options', () => {
    expect(
      parseRedisConnectionUrl('redis://worker:pass%40word@cache.example:6380/3?family=4&connectTimeout=2500&maxRetriesPerRequest=2')
    ).toEqual({
      host: 'cache.example',
      port: 6380,
      username: 'worker',
      password: 'pass@word',
      db: 3,
      family: 4,
      connectTimeout: 2500,
      maxRetriesPerRequest: 2
    });
  });

  it('enables TLS for rediss URLs and supports null retry limits', () => {
    expect(parseRedisConnectionUrl('rediss://cache.example/0?maxRetriesPerRequest=null')).toEqual({
      host: 'cache.example',
      db: 0,
      tls: {},
      maxRetriesPerRequest: null
    });
  });

  it('rejects unsupported query options without exposing their values', () => {
    expect(() => parseRedisConnectionUrl('redis://cache.example?private=value')).toThrow('REDIS_URL contains an unsupported query option.');
    expect(() => parseRedisConnectionUrl('redis://cache.example?private=value')).toThrowError(expect.not.stringContaining('value'));
  });

  it('supports ioredis port and unix-socket shortcuts', () => {
    expect(parseRedisConnectionUrl('6380')).toEqual({ port: 6380 });
    expect(parseRedisConnectionUrl('/run/redis.sock')).toEqual({ path: '/run/redis.sock' });
  });
});
