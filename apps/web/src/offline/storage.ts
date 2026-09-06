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
  businessLines: Array<{ id: string; memberName: string; callingName: string; actionType: string; status: string; updatedAt?: string }>;
  technology?: { ownerName: string | null; roomReady: boolean; audioReady: boolean; streamReady: boolean; accessibilityChecked: boolean; authorizedLink: string | null; recordingDeletionReminder: boolean; startConfirmedAt: string | null; stopConfirmedAt: string | null } | null;
  membershipActions?: Array<{
    id: string;
    memberName: string;
    actionType: string;
    priesthoodOffice?: string | null;
    status: string;
    plannedDate?: string | null;
    interviewStatus?: string;
    interviewDate?: string | null;
    interviewerName?: string | null;
    approvalConfirmed?: boolean;
    presentingLeader?: string | null;
    performingPriesthoodHolder?: string | null;
    ordinanceDate?: string | null;
    baptismDate?: string | null;
    confirmationDate?: string | null;
    baptismStatus?: string | null;
    confirmationStatus?: string | null;
    responsibleLeader?: string | null;
    lcrFollowUpStatus?: string;
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
  meetingId: string;
  wardId: string;
  operation: 'CREATE_PRIVATE_NOTE' | 'UPDATE_PRIVATE_NOTE' | 'MARK_BUSINESS_ANNOUNCED';
  payload: {
    noteId?: string;
    localNoteId?: string;
    lineId?: string;
    target?: { type: 'MEETING' | 'PROGRAM_ITEM'; meetingId?: string; programItemId?: string };
    noteText: string;
    baseRevision?: string;
  };
  createdAt: string;
  status: 'pending' | 'conflict' | 'failed';
  error?: string;
  serverText?: string;
  serverStatus?: string;
  serverRevision?: string;
};

type OfflineContext = { id: 'current'; userId: string; wardId: string };

export const OFFLINE_CACHE_NAME = 'the-stand-offline-v1';
const DATABASE_NAME = 'the-stand-offline';
const VERSION = 5;
const SNAPSHOT_STORE = 'stand-snapshots';
const INTERVIEW_STORE = 'interview-snapshots';
const MUTATION_STORE = 'stand-mutations';
const CONTEXT_STORE = 'offline-context';

export function isOfflineContextMatch(context: OfflineContext | undefined, userId: string, wardId: string): boolean {
  return context?.userId === userId && context.wardId === wardId;
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

export async function clearOfflineData(): Promise<void> {
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

export async function ensureOfflineContext(userId: string, wardId: string): Promise<void> {
  const context = await storeRequest<OfflineContext | undefined>(CONTEXT_STORE, 'readonly', (store) => store.get('current'));
  if (isOfflineContextMatch(context, userId, wardId)) return;

  await clearOfflineData();
  await storeRequest(CONTEXT_STORE, 'readwrite', (store) => store.put({ id: 'current', userId, wardId } satisfies OfflineContext));
}

export async function saveOfflineSnapshot(snapshot: OfflineStandSnapshot): Promise<void> {
  await storeRequest(SNAPSHOT_STORE, 'readwrite', (store) =>
    store.put({ ...snapshot, cacheKey: snapshotKey(snapshot.userId, snapshot.wardId, snapshot.meeting.id) })
  );
}

export async function loadOfflineSnapshot(userId: string, wardId: string, meetingId: string): Promise<OfflineStandSnapshot | null> {
  return (
    (await storeRequest<OfflineStandSnapshot | undefined>(SNAPSHOT_STORE, 'readonly', (store) =>
      store.get(snapshotKey(userId, wardId, meetingId))
    )) ?? null
  );
}

export async function saveOfflineInterviewSnapshot(snapshot: OfflineInterviewSnapshot): Promise<void> {
  await storeRequest(INTERVIEW_STORE, 'readwrite', (store) =>
    store.put({ ...snapshot, cacheKey: `${snapshot.userId}:${snapshot.wardId}` })
  );
}

export async function loadOfflineInterviewSnapshot(userId: string, wardId: string): Promise<OfflineInterviewSnapshot | null> {
  return (
    (await storeRequest<OfflineInterviewSnapshot | undefined>(INTERVIEW_STORE, 'readonly', (store) =>
      store.get(`${userId}:${wardId}`)
    )) ?? null
  );
}

export async function queueOfflineMutation(mutation: OfflineMutation): Promise<void> {
  await storeRequest(MUTATION_STORE, 'readwrite', (store) => store.put(mutation));
}

export async function listOfflineMutations(): Promise<OfflineMutation[]> {
  return (await storeRequest<OfflineMutation[]>(MUTATION_STORE, 'readonly', (store) => store.getAll())) ?? [];
}

export async function removeOfflineMutation(id: string): Promise<void> {
  await storeRequest(MUTATION_STORE, 'readwrite', (store) => store.delete(id));
}

export async function updateOfflineMutation(mutation: OfflineMutation): Promise<void> {
  await queueOfflineMutation(mutation);
}
