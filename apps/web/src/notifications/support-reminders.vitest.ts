import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDueSupportReminderEvents } from './support-reminders';

describe('support reminder sweep', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses configured aging thresholds and returns global jobs', async () => {
    vi.stubEnv('SUPPORT_ASSIGNMENT_REMINDER_AFTER_HOURS', '12');
    vi.stubEnv('SUPPORT_ASSIGNMENT_REMINDER_INTERVAL_HOURS', '6');
    vi.stubEnv('SUPPORT_ASSIGNMENT_MAX_REMINDERS', '2');
    const query = vi.fn().mockResolvedValue({ rows: [{ globalEventOutboxId: 'event-1' }] });

    const jobs = await createDueSupportReminderEvents({ query });

    expect(jobs).toEqual([{ kind: 'global-outbox-event', globalEventOutboxId: 'event-1' }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("event_type, payload"), [12, 2, 6]);
    expect(query.mock.calls[0]?.[0]).toContain("status = 'UNASSIGNED'");
  });

  it('returns no jobs when no work items are due', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(createDueSupportReminderEvents({ query })).resolves.toEqual([]);
  });
});
