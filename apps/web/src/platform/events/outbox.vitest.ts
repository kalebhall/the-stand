import { describe, expect, it, vi } from 'vitest';

import { insertCoreEventOutboxEvent, recordCoreEventOutboxFailure } from './outbox';

const event = {
  type: 'MeetingCreated' as const,
  version: 1 as const,
  wardId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
  meetingId: '33333333-3333-4333-8333-333333333333',
  occurredAt: '2024-02-29T12:00:00.000Z',
  meetingDate: '2024-02-29',
  meetingType: 'SACRAMENT'
};

function concurrentClient() {
  let existingId: string | undefined;
  const queries: string[] = [];
  const query = vi.fn(async (text: string) => {
    queries.push(text);
    if (text.includes('INSERT INTO event_outbox')) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!existingId) {
        existingId = 'event-1';
        return { rows: [{ id: existingId }] };
      }
      return { rows: [] };
    }
    return { rows: existingId ? [{ id: existingId }] : [] };
  });
  return { query, queries };
}

describe('Core event outbox insertion', () => {
  it('returns one stable ID for concurrent duplicate insertion attempts', async () => {
    const client = concurrentClient();

    const ids = await Promise.all([
      insertCoreEventOutboxEvent(client as unknown as Parameters<typeof insertCoreEventOutboxEvent>[0], event),
      insertCoreEventOutboxEvent(client as unknown as Parameters<typeof insertCoreEventOutboxEvent>[0], event)
    ]);

    expect(ids).toEqual(['event-1', 'event-1']);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.queries[0]).toContain("ON CONFLICT (ward_id, event_type, aggregate_id)");
    expect(client.queries[0]).toContain("WHERE event_outbox.status = 'pending'");
  });

  it.each(['processed', 'failed'])('does not resurrect a terminal %s row during replay', async (status) => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: `terminal-${status}` }] });

    const id = await insertCoreEventOutboxEvent({ query } as unknown as Parameters<typeof insertCoreEventOutboxEvent>[0], event);

    expect(id).toBe(`terminal-${status}`);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("WHERE event_outbox.status = 'pending'");
    expect(query.mock.calls[1][0]).toContain('SELECT id FROM event_outbox');
  });

  it('increments one retry attempt per failure and marks the fifth attempt terminal', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as Parameters<typeof recordCoreEventOutboxFailure>[0];

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await recordCoreEventOutboxFailure(client, {
        wardId: event.wardId,
        eventOutboxId: '44444444-4444-4444-8444-444444444444',
        errorMessage: `failure-${attempt}`
      });
    }

    expect(query).toHaveBeenCalledTimes(5);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('attempts = attempts + 1');
      expect(sql).toContain("status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END");
      expect(params).toEqual([eventOutboxId(), event.wardId, expect.stringMatching(/^failure-/)]);
    }
  });
});

function eventOutboxId(): string {
  return '44444444-4444-4444-8444-444444444444';
}
