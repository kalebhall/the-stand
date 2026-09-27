import { describe, expect, it, vi } from 'vitest';

import { persistMembershipOrdinanceLcrFollowUp } from './membership-ordinance-follow-up-persistence';

describe('persistMembershipOrdinanceLcrFollowUp', () => {
  it('upserts an Aaronic priesthood LCR handoff with the ordinance source', async () => {
    const query = vi.fn().mockResolvedValue({});

    await persistMembershipOrdinanceLcrFollowUp({ query } as never, {
      wardId: '11111111-1111-4111-8111-111111111111',
      ordinanceId: '22222222-2222-4222-8222-222222222222',
      memberName: 'Jane Doe',
      actionType: 'PRIESTHOOD_ADVANCEMENT',
      priesthoodOffice: 'DEACON',
      plannedDate: '2026-10-04',
      details: null
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (ward_id, action_type, source_event_id)'),
      expect.arrayContaining([
        '11111111-1111-4111-8111-111111111111',
        'PRIESTHOOD_ADVANCEMENT',
        'Jane Doe',
        '22222222-2222-4222-8222-222222222222',
        expect.stringContaining('Follow up in LCR'),
        expect.stringContaining('record-aaronic-priesthood-ordinations'),
        '2026-10-04'
      ])
    );
  });

  it('uses the Melchizedek recording reference for an elder ordination', async () => {
    const query = vi.fn().mockResolvedValue({});

    await persistMembershipOrdinanceLcrFollowUp({ query } as never, {
      wardId: '11111111-1111-4111-8111-111111111111',
      ordinanceId: '22222222-2222-4222-8222-222222222222',
      memberName: 'John Doe',
      actionType: 'PRIESTHOOD_ORDINATION',
      priesthoodOffice: 'ELDER',
      plannedDate: null,
      details: 'Stake authorization required'
    });

    expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([expect.stringContaining('record-melchizedek-priesthood-ordinations')]));
  });
});
