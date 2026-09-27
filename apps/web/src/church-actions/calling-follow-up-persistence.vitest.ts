import { describe, expect, it, vi } from 'vitest';

import { persistCallingLcrFollowUp } from './calling-follow-up-persistence';

describe('persistCallingLcrFollowUp', () => {
  it('upserts a ward-scoped LCR follow-up for a calling transition', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ member_name: 'Jane Smith', calling_name: 'Relief Society President' }] })
      .mockResolvedValueOnce({ rows: [] });

    await persistCallingLcrFollowUp({ query } as never, { wardId: 'ward-1', callingId: 'calling-1', status: 'SET_APART' });

    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM calling_assignment'), ['calling-1', 'ward-1']);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO church_action_follow_up'),
      expect.arrayContaining([
        'ward-1',
        'CALLING_SET_APART_RECORDING',
        'Jane Smith',
        'calling-1',
        expect.stringContaining('Record set apart in LCR')
      ])
    );
  });

  it('does not write when the transition has no LCR follow-up rule', async () => {
    const query = vi.fn();

    await persistCallingLcrFollowUp(query as never, { wardId: 'ward-1', callingId: 'calling-1', status: 'PROPOSED' });

    expect(query).not.toHaveBeenCalled();
  });
});
