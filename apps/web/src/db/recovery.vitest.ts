import { describe, expect, it, vi } from 'vitest';

import { withDatabaseRecovery } from './recovery';

describe('withDatabaseRecovery', () => {
  it('resets pool and retries once after a transient database failure', async () => {
    const reset = vi.fn();
    const operation = vi.fn().mockRejectedValueOnce(new Error('connection terminated')).mockResolvedValue('ok');

    await expect(withDatabaseRecovery(operation, reset)).resolves.toBe('ok');
    expect(reset).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent failures more than once', async () => {
    const reset = vi.fn();
    const failure = new Error('query failed');
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(withDatabaseRecovery(operation, reset)).rejects.toBe(failure);
    expect(reset).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
