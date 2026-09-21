import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function mediaRoot(): string {
  const root = path.resolve(process.env.MEDIA_ROOT ?? path.join(process.cwd(), 'var', 'media'));
  if (root.includes(`${path.sep}.next${path.sep}`) || root.endsWith(`${path.sep}.next`)) throw new Error('MEDIA_ROOT cannot be inside the build directory.');
  return root;
}

function safeKey(key: string): string {
  const normalized = key.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => part === '..' || part === '' || part.includes('\0'))) throw new Error('Invalid media storage key.');
  const root = mediaRoot();
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid media storage key.');
  return normalized;
}

export function createStorageKey(extension: 'jpg' | 'png' | 'webp'): string {
  return `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
}

export async function writeMedia(key: string, buffer: Buffer): Promise<void> {
  const safe = safeKey(key);
  const target = path.resolve(mediaRoot(), safe);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, buffer, { mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readMedia(key: string): Promise<Buffer> {
  return readFile(path.resolve(mediaRoot(), safeKey(key)));
}

export async function deleteMedia(key: string): Promise<void> {
  await rm(path.resolve(mediaRoot(), safeKey(key)), { force: true });
}
