import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const serviceWorkerPath = path.resolve(process.cwd(), 'public/sw.js');

describe('offline service-worker privacy policy', () => {
  it('uses a versioned cache and removes older offline cache versions', async () => {
    const source = await readFile(serviceWorkerPath, 'utf8');
    expect(source).toContain("const CACHE_NAME = 'the-stand-offline-v2';");
    expect(source).toContain("key.startsWith('the-stand-offline-') && key !== CACHE_NAME");
  });

  it('does not cache API responses or authenticated workflow requests', async () => {
    const source = await readFile(serviceWorkerPath, 'utf8');
    expect(source).toContain("!url.pathname.startsWith('/api/')");
    expect(source).toContain("url.pathname.startsWith('/_next/static/')");
    expect(source).not.toContain("url.pathname.startsWith('/api/') ||");
  });
});
