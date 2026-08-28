import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, connectMock, releaseMock, setDbContextMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  setDbContextMock: vi.fn()
}));

vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));

import { copyCalendarEventToAnnouncement } from './service';

const args = {
  wardId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  calendarEventCacheId: '33333333-3333-4333-8333-333333333333'
};

describe('copyCalendarEventToAnnouncement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('creates an immediately active announcement and applies tag mapping', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: args.calendarEventCacheId,
        title: 'Ward Activity',
        description: 'Bring dinner',
        starts_at: '2026-08-30T18:00:00.000Z',
        ends_at: '2026-08-30T20:00:00.000Z',
        tags: ['public'],
        copied_to_announcement_at: null,
        tag_map: { public: { placement: 'PROGRAM_BOTTOM', isPermanent: false } }
      }] })
      .mockResolvedValueOnce({ rows: [{ id: 'announcement-1' }] }) // INSERT announcement
      .mockResolvedValueOnce({}) // mark copied
      .mockResolvedValueOnce({}) // audit
      .mockResolvedValueOnce({}); // COMMIT

    const result = await copyCalendarEventToAnnouncement(args);

    expect(result).toBe('announcement-1');
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO announcement'), [
      args.wardId, 'Ward Activity', 'Bring dinner', null, '2026-08-30', false, 'PROGRAM_BOTTOM', true, false
    ]);
    expect(queryMock).toHaveBeenNthCalledWith(4, expect.stringContaining('copied_to_announcement_at'), [args.calendarEventCacheId, args.wardId]);
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });
});
