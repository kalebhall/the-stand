import { describe, expect, it } from 'vitest';

import { isInterviewDue, validateInterviewStatusChange } from './interviews';

describe('scheduled interview rules', () => {
  it('keeps cancelled interviews closed', () => {
    expect(validateInterviewStatusChange('CANCELLED', 'SCHEDULED')).toBe('Cancelled interviews cannot be reopened.');
    expect(validateInterviewStatusChange('COMPLETED', 'SCHEDULED')).toBe('Completed interviews cannot return to scheduled.');
  });

  it('detects past scheduled interviews', () => {
    expect(isInterviewDue('2026-09-05T10:00:00Z', 'SCHEDULED', new Date('2026-09-05T11:00:00Z'))).toBe(true);
    expect(isInterviewDue('2026-09-05T10:00:00Z', 'COMPLETED', new Date('2026-09-05T11:00:00Z'))).toBe(false);
  });
});
