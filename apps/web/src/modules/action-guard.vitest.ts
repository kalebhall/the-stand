import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isWardModuleEnabled, redirect } = vi.hoisted(() => ({
  isWardModuleEnabled: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  })
}));

vi.mock('./service', () => ({ isWardModuleEnabled }));
vi.mock('next/navigation', () => ({ redirect }));

import { requireWardModuleEnabled } from './action-guard';

describe('requireWardModuleEnabled', () => {
  beforeEach(() => {
    isWardModuleEnabled.mockReset();
    redirect.mockClear();
  });

  it('returns true when the ward module is enabled', async () => {
    isWardModuleEnabled.mockResolvedValue(true);

    await expect(requireWardModuleEnabled('ward-1', 'user-1', 'announcements', '/announcements')).resolves.toBe(true);
    expect(isWardModuleEnabled).toHaveBeenCalledWith('ward-1', 'user-1', 'announcements');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to the supplied stable destination when the ward module is disabled', async () => {
    isWardModuleEnabled.mockResolvedValue(false);

    await expect(requireWardModuleEnabled('ward-1', 'user-1', 'announcements', '/announcements')).rejects.toThrow('REDIRECT:/announcements');
    expect(redirect).toHaveBeenCalledWith('/announcements');
  });
});
