import { describe, expect, it, vi } from 'vitest';

import { findPendingOutboxEvents } from './recovery';

describe('notification outbox recovery', () => {
  it('discovers pending events per ward under RLS context', async () => {
    const queryMock = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      if (sql === 'SELECT id FROM ward ORDER BY id') return { rows: [{ id: 'ward-1' }, { id: 'ward-2' }], rowCount: 2 };
      if (sql.includes('FROM event_outbox')) {
        return { rows: [{ id: values?.[0] === 'ward-1' ? 'event-1' : 'event-2' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(findPendingOutboxEvents({ query: queryMock }, 10)).resolves.toEqual([
      { wardId: 'ward-1', eventOutboxId: 'event-1' },
      { wardId: 'ward-2', eventOutboxId: 'event-2' }
    ]);

    expect(queryMock).toHaveBeenCalledWith('SELECT set_config($1, $2, true)', ['app.ward_id', 'ward-1']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("status = 'pending'"), ['ward-2', 9]);
  });
});
