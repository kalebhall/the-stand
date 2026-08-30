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
  wardId: string;
  meeting: { id: string; meetingDate: string; meetingType: string };
  standRows: Array<Record<string, unknown>>;
  businessLines: Array<{ id: string; memberName: string; callingName: string; actionType: string; status: string }>;
  notes?: OfflineNote[];
  progress?: OfflineProgress;
  savedAt: string;
};

export type OfflineMutation = {
  id: string;
  meetingId: string;
  wardId: string;
  operation: 'CREATE_PRIVATE_NOTE' | 'UPDATE_PRIVATE_NOTE';
  payload: { noteId?: string; localNoteId?: string; target?: { type: 'MEETING' | 'PROGRAM_ITEM'; meetingId?: string; programItemId?: string }; noteText: string; baseRevision?: string };
  createdAt: string;
  status: 'pending' | 'conflict' | 'failed';
  error?: string;
};

const DATABASE_NAME = 'the-stand-offline';
const VERSION = 2;
const SNAPSHOT_STORE = 'stand-snapshots';
const MUTATION_STORE = 'stand-mutations';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'meeting.id' });
      if (!db.objectStoreNames.contains(MUTATION_STORE)) db.createObjectStore(MUTATION_STORE, { keyPath: 'id' });
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
  } finally { db.close(); }
}

export async function saveOfflineSnapshot(snapshot: OfflineStandSnapshot): Promise<void> {
  await storeRequest(SNAPSHOT_STORE, 'readwrite', (store) => store.put(snapshot));
}

export async function loadOfflineSnapshot(meetingId: string): Promise<OfflineStandSnapshot | null> {
  return (await storeRequest<OfflineStandSnapshot | undefined>(SNAPSHOT_STORE, 'readonly', (store) => store.get(meetingId))) ?? null;
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
