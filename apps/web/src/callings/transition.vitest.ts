import { describe, expect, it, vi } from 'vitest';

import { appendCallingStatus, fetchCurrentCallingStatus } from './transition';

describe('calling transition persistence', () => {
  it('rejects invalid transitions without writing', async () => {
    const query = vi.fn();
    const result = await appendCallingStatus({ query } as never, {
      wardId: 'ward-1',
      callingId: 'calling-1',
      fromStatus: 'PROPOSED',
      toStatus: 'SET_APART'
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    expect(query).not.toHaveBeenCalled();
  });

  it('records release transitions and deactivates calling', async () => {
    const query = vi.fn().mockResolvedValue({});
    const result = await appendCallingStatus({ query } as never, {
      wardId: 'ward-1',
      callingId: 'calling-1',
      fromStatus: 'SUSTAINED',
      toStatus: 'TO_BE_RELEASED'
    });

    expect(result).toEqual({ ok: true });
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO calling_action'), [
      'ward-1',
      'calling-1',
      'TO_BE_RELEASED'
    ]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('is_active = FALSE'), ['calling-1', 'ward-1']);
  });

  it('reactivates an assignment when status becomes assigned', async () => {
    const query = vi.fn().mockResolvedValue({});
    await appendCallingStatus({ query } as never, {
      wardId: 'ward-1',
      callingId: 'calling-1',
      fromStatus: 'SET_APART',
      toStatus: 'ASSIGNED'
    });

    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('is_active = TRUE'), ['calling-1', 'ward-1']);
  });

  it('reads the latest calling action inside ward scope', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ action_status: 'EXTENDED' }] });
    const result = await fetchCurrentCallingStatus({ query } as never, 'ward-1', 'calling-1');

    expect(result).toBe('EXTENDED');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'), ['calling-1', 'ward-1']);
  });
});
