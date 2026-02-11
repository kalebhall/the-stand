const WINDOW_MS = 10 * 60 * 1000;

type Entry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Entry>();

function getNow(): number {
  return Date.now();
}

export function enforceRateLimit(key: string, maxAttempts: number): boolean {
  const now = getNow();
  const existing = buckets.get(key);

  if (!existing || now > existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (existing.count >= maxAttempts) {
    return false;
  }

  existing.count += 1;
  return true;
}

export function clearRateLimitForTests(): void {
  buckets.clear();
}
