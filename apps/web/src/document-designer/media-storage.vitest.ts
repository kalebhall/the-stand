import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStorageKey, deleteMedia, readMedia, writeMedia } from './media-storage';

let root: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = undefined; });

describe('media storage boundary', () => {
  it('writes and reads opaque keys under the configured root', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'stand-media-'));
    process.env.MEDIA_ROOT = root;
    const key = createStorageKey('png');
    await writeMedia(key, Buffer.from('image-bytes'));
    await expect(readMedia(key)).resolves.toEqual(Buffer.from('image-bytes'));
    await deleteMedia(key);
    await expect(readMedia(key)).rejects.toBeTruthy();
    delete process.env.MEDIA_ROOT;
  });

  it('rejects traversal keys', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'stand-media-'));
    process.env.MEDIA_ROOT = root;
    await expect(writeMedia('../escape.png', Buffer.from('x'))).rejects.toThrow(/Invalid media storage key/);
    delete process.env.MEDIA_ROOT;
  });
});
