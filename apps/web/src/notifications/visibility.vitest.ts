import { describe, expect, it } from 'vitest';

import {
  canIncludeNoteTextInNotification,
  canViewNotificationSource,
  canViewNote,
  filterVisibleNoteRecipients,
  validateNoteVisibility
} from './visibility';

const baseContext = {
  wardId: 'ward-1',
  sourceWardId: 'ward-1',
  visibility: 'PRIVATE' as const,
  createdByUserId: 'creator-1',
  readerUserId: 'reader-1',
  canUseInternalNotes: true
};

describe('notification visibility', () => {
  it('requires source existence, visibility, and ward match', () => {
    expect(canViewNotificationSource({
      wardId: 'ward-1', sourceWardId: 'ward-1', sourceExists: true, sourceIsVisible: true
    })).toBe(true);
    expect(canViewNotificationSource({
      wardId: 'ward-1', sourceWardId: 'ward-2', sourceExists: true, sourceIsVisible: true
    })).toBe(false);
    expect(canViewNotificationSource({
      wardId: 'ward-1', sourceWardId: 'ward-1', sourceExists: false, sourceIsVisible: true
    })).toBe(false);
  });

  it('allows private notes only to creator or explicitly authorized users', () => {
    expect(canViewNote({ ...baseContext, readerUserId: 'creator-1' })).toBe(true);
    expect(canViewNote({ ...baseContext, explicitlyAuthorizedUserIds: ['reader-1'] })).toBe(true);
    expect(canViewNote(baseContext)).toBe(false);
    expect(canIncludeNoteTextInNotification(baseContext)).toBe(false);
  });

  it('allows leadership notes to internal-note users in same ward', () => {
    expect(canViewNote({ ...baseContext, visibility: 'LEADERSHIP' })).toBe(true);
    expect(canViewNote({ ...baseContext, visibility: 'LEADERSHIP', canUseInternalNotes: false })).toBe(false);
    expect(canViewNote({ ...baseContext, visibility: 'LEADERSHIP', sourceWardId: 'ward-2' })).toBe(false);
  });

  it('filters recipients before notification details are generated', () => {
    expect(filterVisibleNoteRecipients(['creator-1', 'reader-1', 'reader-2'], {
      ...baseContext,
      visibility: 'PRIVATE',
      explicitlyAuthorizedUserIds: ['reader-2']
    })).toEqual(['creator-1', 'reader-2']);
  });

  it('validates note visibility values', () => {
    expect(validateNoteVisibility('LEADERSHIP')).toBe('LEADERSHIP');
    expect(() => validateNoteVisibility('PUBLIC')).toThrow('Invalid note visibility');
  });
});
