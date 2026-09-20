export type OfflineNote = {
  id: string;
  visibility: 'PRIVATE';
  noteText: string;
  createdAt: string;
  updatedAt?: string;
  pending?: boolean;
};

export type OfflineProgress = Record<string, boolean>;

export type OfflineStandSnapshot = {
  userId: string;
  wardId: string;
  meeting: { id: string; meetingDate: string; meetingType: string };
  standRows: Array<Record<string, unknown>>;
  businessLines: Array<{ id: string; memberName: string; callingName: string; actionType: string; status: string; carriedForward?: boolean; updatedAt?: string }>;
  technology?: { ownerName: string | null; roomReady: boolean; audioReady: boolean; streamReady: boolean; accessibilityChecked: boolean; authorizedLink: string | null; recordingDeletionReminder: boolean; startConfirmedAt: string | null; stopConfirmedAt: string | null } | null;
  membershipActions?: Array<{
    id: string;
    memberName: string;
    actionType: string;
    priesthoodOffice?: string | null;
    status: string;
    plannedDate?: string | null;
    interviewStatus?: string;
    baptismDate?: string | null;
    confirmationDate?: string | null;
    baptismStatus?: string | null;
    confirmationStatus?: string | null;
    responsibleLeader?: string | null;
    lcrFollowUpStatus?: string;
    carriedForward?: boolean;
    lcrUpdatedAt?: string | null;
  }>;
  notes?: OfflineNote[];
  progress?: OfflineProgress;
  savedAt: string;
};

export type OfflineInterview = {
  id: string;
  interview_type: string;
  member_name: string;
  interviewer_name: string;
  scheduled_at: string;
  status: string;
  linked_action_id?: string | null;
  linked_calling_id?: string | null;
  completed_at?: string | null;
};

export type OfflineInterviewSnapshot = {
  userId: string;
  wardId: string;
  interviews: OfflineInterview[];
  savedAt: string;
};

export type OfflineMutation = {
  id: string;
  userId: string;
  meetingId: string;
  wardId: string;
  operation: 'CREATE_PRIVATE_NOTE' | 'UPDATE_PRIVATE_NOTE' | 'MARK_BUSINESS_ANNOUNCED';
  payload: {
    noteId?: string;
    localNoteId?: string;
    lineId?: string;
    target?: { type: 'MEETING' | 'PROGRAM_ITEM'; meetingId?: string; programItemId?: string };
    noteText: string;
    previousNoteText?: string;
    baseRevision?: string;
  };
  createdAt: string;
  status: 'pending' | 'conflict' | 'failed';
  error?: string;
  serverText?: string;
  serverStatus?: string;
  serverRevision?: string;
};

export type OfflineContext = { id: 'current'; userId: string; wardId: string };
export type OfflineAuthorization = { userId: string; wardId: string | null };

export const OFFLINE_CACHE_NAME = 'the-stand-offline-v2';
export const OFFLINE_SNAPSHOT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DATABASE_NAME = 'the-stand-offline';
const VERSION = 5;
const SNAPSHOT_STORE = 'stand-snapshots';
const INTERVIEW_STORE = 'interview-snapshots';
const MUTATION_STORE = 'stand-mutations';
const CONTEXT_STORE = 'offline-context';
const DELETION_MARKER_KEY = 'the-stand-offline-deletion-pending';
let contextTransition: Promise<void> = Promise.resolve();
let offlineWriteEpoch = 0;
let offlineDeletionRequests = 0;

function getDeletionMarker(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(DELETION_MARKER_KEY);
  } catch {
    return null;
  }
}

function setDeletionMarker(value: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(DELETION_MARKER_KEY, value);
    else localStorage.removeItem(DELETION_MARKER_KEY);
  } catch {
    // Same-realm barrier remains active when localStorage is unavailable.
  }
}

function isPendingDeletionMarker(value: string | null): boolean {
  return value?.startsWith('pending:') ?? false;
}

function serializeContextTransition<T>(operation: () => Promise<T>): Promise<T> {
  const next = contextTransition.then(operation, operation);
  contextTransition = next.then(() => undefined, () => undefined);
  return next;
}

export function isOfflineContextMatch(context: OfflineContext | undefined, userId: string, wardId: string): boolean {
  return context?.userId === userId && context.wardId === wardId;
}

export function isOfflineAuthorizationMatch(
  context: OfflineContext | undefined,
  authorization: OfflineAuthorization | undefined
): boolean {
  if (!authorization?.wardId) return false;
  return isOfflineContextMatch(context, authorization.userId, authorization.wardId);
}

export function parseOfflineAuthorization(value: unknown): OfflineAuthorization | undefined {
  if (!isRecord(value)) return undefined;
  const body = value;
  if (!body.user || typeof body.user !== 'object' || typeof body.activeWardId !== 'string' && body.activeWardId !== null) return undefined;
  const user = body.user;
  return isRecord(user) && typeof user.id === 'string' ? { userId: user.id, wardId: body.activeWardId } : undefined;
}

export function getOfflineSnapshotAge(savedAt: string, now = Date.now()): { ageMs: number; isStale: boolean } {
  const savedAtMs = Date.parse(savedAt);
  if (!Number.isFinite(savedAtMs)) return { ageMs: 0, isStale: true };
  const ageMs = Math.max(0, now - savedAtMs);
  return { ageMs, isStale: ageMs >= OFFLINE_SNAPSHOT_STALE_AFTER_MS };
}

export function formatOfflineAge(savedAt: string, now = Date.now()): string {
  if (!Number.isFinite(Date.parse(savedAt))) return 'unknown age';
  const { ageMs } = getOfflineSnapshotAge(savedAt, now);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'cacheKey' });
      if (!db.objectStoreNames.contains(INTERVIEW_STORE)) db.createObjectStore(INTERVIEW_STORE, { keyPath: 'cacheKey' });
      if (!db.objectStoreNames.contains(MUTATION_STORE)) db.createObjectStore(MUTATION_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CONTEXT_STORE)) db.createObjectStore(CONTEXT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline storage.'));
  });
}

async function storeRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Offline storage request failed.'));
    });
  } finally {
    db.close();
  }
}

function snapshotKey(userId: string, wardId: string, meetingId: string): string {
  return `${userId}:${wardId}:${meetingId}`;
}

async function clearOfflineDataInternal(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([SNAPSHOT_STORE, INTERVIEW_STORE, MUTATION_STORE, CONTEXT_STORE], 'readwrite');
      transaction.objectStore(SNAPSHOT_STORE).clear();
      transaction.objectStore(INTERVIEW_STORE).clear();
      transaction.objectStore(MUTATION_STORE).clear();
      transaction.objectStore(CONTEXT_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to clear offline storage.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to clear offline storage.'));
    });
  } finally {
    db.close();
  }
  if ('caches' in globalThis) await caches.delete(OFFLINE_CACHE_NAME);
}

async function notifyServiceWorkerCacheClear(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const message = { type: 'CLEAR_OFFLINE_CACHE' };
  navigator.serviceWorker.controller?.postMessage(message);
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage(message);
  } catch {
    // Cache deletion below remains authoritative when no active registration is available.
  }
}

export function clearOfflineData(): Promise<void> {
  offlineWriteEpoch += 1;
  offlineDeletionRequests += 1;
  const deletionMarker = `${Date.now()}-${Math.random()}`;
  setDeletionMarker(`pending:${deletionMarker}`);
  return serializeContextTransition(async () => {
    try {
      await clearOfflineDataInternal();
      await notifyServiceWorkerCacheClear();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('offline-data-cleared'));
    } finally {
      offlineDeletionRequests = Math.max(0, offlineDeletionRequests - 1);
      if (getDeletionMarker() === `pending:${deletionMarker}`) setDeletionMarker(`complete:${deletionMarker}`);
    }
  });
}

export function isOfflineDeletionPending(): boolean {
  return offlineDeletionRequests > 0 || isPendingDeletionMarker(getDeletionMarker());
}

export function ensureOfflineContext(userId: string, wardId: string): Promise<void> {
  return serializeContextTransition(async () => {
    const context = await storeRequest<OfflineContext | undefined>(CONTEXT_STORE, 'readonly', (store) => store.get('current'));
    if (isOfflineContextMatch(context, userId, wardId) && !isOfflineDeletionPending()) return;
    offlineWriteEpoch += 1;
    offlineDeletionRequests += 1;
    const deletionMarker = `${Date.now()}-${Math.random()}`;
    setDeletionMarker(`pending:${deletionMarker}`);
    try {
      await clearOfflineDataInternal();
      await notifyServiceWorkerCacheClear();
      await storeRequest(CONTEXT_STORE, 'readwrite', (store) => store.put({ id: 'current', userId, wardId } satisfies OfflineContext));
    } finally {
      offlineDeletionRequests = Math.max(0, offlineDeletionRequests - 1);
      if (getDeletionMarker() === `pending:${deletionMarker}`) setDeletionMarker(`complete:${deletionMarker}`);
    }
  });
}

export function saveOfflineSnapshot(snapshot: OfflineStandSnapshot): Promise<void> {
  const deletionMarker = getDeletionMarker();
  if (offlineDeletionRequests > 0 || isPendingDeletionMarker(deletionMarker)) return Promise.resolve();
  const writeEpoch = offlineWriteEpoch;
  return serializeContextTransition(async () => {
    if (writeEpoch !== offlineWriteEpoch || isPendingDeletionMarker(getDeletionMarker()) || getDeletionMarker() !== deletionMarker) return;
    await storeRequest(SNAPSHOT_STORE, 'readwrite', (store) =>
      store.put({ ...snapshot, cacheKey: snapshotKey(snapshot.userId, snapshot.wardId, snapshot.meeting.id) })
    );
  });
}

export async function loadOfflineSnapshot(userId: string, wardId: string, meetingId: string): Promise<OfflineStandSnapshot | null> {
  if (isOfflineDeletionPending()) return null;
  const snapshot = (await storeRequest<OfflineStandSnapshot | undefined>(SNAPSHOT_STORE, 'readonly', (store) =>
    store.get(snapshotKey(userId, wardId, meetingId))
  )) ?? null;
  if (isOfflineDeletionPending()) return null;
  if (snapshot && ['STAKE_CONFERENCE', 'GENERAL_CONFERENCE'].includes(snapshot.meeting.meetingType)) {
    return { ...snapshot, businessLines: [], membershipActions: [] };
  }
  return snapshot;
}

export async function saveOfflineInterviewSnapshot(snapshot: OfflineInterviewSnapshot): Promise<void> {
  const deletionMarker = getDeletionMarker();
  if (offlineDeletionRequests > 0 || isPendingDeletionMarker(deletionMarker)) return;
  const writeEpoch = offlineWriteEpoch;
  await serializeContextTransition(async () => {
    if (writeEpoch !== offlineWriteEpoch || isPendingDeletionMarker(getDeletionMarker()) || getDeletionMarker() !== deletionMarker) return;
    await storeRequest(INTERVIEW_STORE, 'readwrite', (store) =>
      store.put({ ...snapshot, cacheKey: `${snapshot.userId}:${snapshot.wardId}` })
    );
  });
}

export async function loadOfflineInterviewSnapshot(userId: string, wardId: string): Promise<OfflineInterviewSnapshot | null> {
  if (isOfflineDeletionPending()) return null;
  const snapshot = (await storeRequest<OfflineInterviewSnapshot | undefined>(INTERVIEW_STORE, 'readonly', (store) =>
    store.get(`${userId}:${wardId}`)
  )) ?? null;
  return isOfflineDeletionPending() ? null : snapshot;
}

export function queueOfflineMutation(mutation: OfflineMutation): Promise<void> {
  const deletionMarker = getDeletionMarker();
  if (offlineDeletionRequests > 0 || isPendingDeletionMarker(deletionMarker)) return Promise.resolve();
  const writeEpoch = offlineWriteEpoch;
  return serializeContextTransition(async () => {
    if (writeEpoch !== offlineWriteEpoch || isPendingDeletionMarker(getDeletionMarker()) || getDeletionMarker() !== deletionMarker) return;
    await storeRequest(MUTATION_STORE, 'readwrite', (store) => store.put(mutation));
  });
}

export async function listOfflineMutations(): Promise<OfflineMutation[]> {
  return (await storeRequest<OfflineMutation[]>(MUTATION_STORE, 'readonly', (store) => store.getAll())) ?? [];
}

export function cacheOfflinePage(meetingId: string, expectedEpoch = offlineWriteEpoch): Promise<void> {
  const deletionMarker = getDeletionMarker();
  if (offlineDeletionRequests > 0 || isPendingDeletionMarker(deletionMarker)) return Promise.resolve();
  return serializeContextTransition(async () => {
    if (offlineDeletionRequests > 0 || isPendingDeletionMarker(getDeletionMarker()) || getDeletionMarker() !== deletionMarker || expectedEpoch !== offlineWriteEpoch || !('caches' in globalThis)) return;
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    if (expectedEpoch !== offlineWriteEpoch || isPendingDeletionMarker(getDeletionMarker()) || getDeletionMarker() !== deletionMarker) return;
    await cache.add(`/stand/${meetingId}/offline`);
    if (expectedEpoch !== offlineWriteEpoch || isPendingDeletionMarker(getDeletionMarker()) || getDeletionMarker() !== deletionMarker) {
      await caches.delete(OFFLINE_CACHE_NAME);
    }
  });
}

export async function removeOfflineMutation(id: string, expectedEpoch = offlineWriteEpoch): Promise<void> {
  const deletionMarker = getDeletionMarker();
  await serializeContextTransition(async () => {
    if (offlineDeletionRequests > 0 || isPendingDeletionMarker(getDeletionMarker()) || getDeletionMarker() !== deletionMarker || expectedEpoch !== offlineWriteEpoch) return;
    await storeRequest(MUTATION_STORE, 'readwrite', (store) => store.delete(id));
  });
}

export function getOfflineWriteEpoch(): number {
  return offlineWriteEpoch;
}

export async function updateOfflineMutation(mutation: OfflineMutation, expectedEpoch = offlineWriteEpoch): Promise<void> {
  if (offlineDeletionRequests > 0 || isPendingDeletionMarker(getDeletionMarker()) || expectedEpoch !== offlineWriteEpoch) return;
  await queueOfflineMutation(mutation);
}
