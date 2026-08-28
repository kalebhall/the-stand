import { isNoteVisibility, type NoteVisibility } from '@/src/notes/types';

export type NoteVisibilityContext = {
  wardId: string;
  sourceWardId: string;
  visibility: NoteVisibility;
  createdByUserId: string;
  readerUserId: string;
  canUseInternalNotes: boolean;
  explicitlyAuthorizedUserIds?: readonly string[];
};

export type NotificationSourceContext = {
  wardId: string;
  sourceWardId: string;
  sourceExists: boolean;
  sourceIsVisible: boolean;
};

export function canViewNotificationSource(context: NotificationSourceContext): boolean {
  return context.wardId === context.sourceWardId && context.sourceExists && context.sourceIsVisible;
}

export function canViewNote(context: NoteVisibilityContext): boolean {
  if (context.wardId !== context.sourceWardId) {
    return false;
  }
  if (!isNoteVisibility(context.visibility)) {
    return false;
  }
  if (context.readerUserId === context.createdByUserId) {
    return true;
  }
  if (context.explicitlyAuthorizedUserIds?.includes(context.readerUserId)) {
    return true;
  }
  return context.visibility === 'LEADERSHIP' && context.canUseInternalNotes;
}

export function canIncludeNoteTextInNotification(context: NoteVisibilityContext): boolean {
  return canViewNote(context);
}

export function filterVisibleNoteRecipients(
  recipients: readonly string[],
  context: Omit<NoteVisibilityContext, 'readerUserId'>
): string[] {
  return recipients.filter((readerUserId) => canViewNote({ ...context, readerUserId }));
}

export function validateNoteVisibility(value: unknown): NoteVisibility {
  if (!isNoteVisibility(value)) {
    throw new Error(`Invalid note visibility: ${String(value)}`);
  }
  return value;
}
