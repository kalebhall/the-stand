import { describe, expect, it } from 'vitest';

import { isBishopricActionDue, validateBishopricActionTransition } from './bishopric';

describe('bishopric workspace rules', () => {
  it('blocks reopening completed action', () => {
    expect(validateBishopricActionTransition('COMPLETED', 'IN_PROGRESS')).toBe('Completed bishopric actions cannot be reopened.');
    expect(validateBishopricActionTransition('PENDING', 'IN_PROGRESS')).toBeNull();
  });

  it('marks only past incomplete actions overdue', () => {
    expect(isBishopricActionDue({ dueDate: '2026-09-04', status: 'PENDING' }, '2026-09-05')).toBe(true);
    expect(isBishopricActionDue({ dueDate: '2026-09-05', status: 'PENDING' }, '2026-09-05')).toBe(false);
    expect(isBishopricActionDue({ dueDate: '2026-09-04', status: 'COMPLETED' }, '2026-09-05')).toBe(false);
  });
});
