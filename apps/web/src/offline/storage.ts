export type OfflineStandSnapshot = {
  meeting: { id: string; meetingDate: string; meetingType: string };
  standRows: Array<Record<string, unknown>>;
  businessLines: Array<{ id: string; memberName: string; callingName: string; actionType: string; status: string }>;
  savedAt: string;
};

const DATABASE_NAME = 'the-stand-offline';
const STORE_NAME = 'stand-snapshots';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'meeting.id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline storage.'));
  });
}

export async function saveOfflineSnapshot(snapshot: OfflineStandSnapshot): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(snapshot);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to save offline snapshot.'));
  });
  db.close();
}

export async function loadOfflineSnapshot(meetingId: string): Promise<OfflineStandSnapshot | null> {
  const db = await openDatabase();
  const snapshot = await new Promise<OfflineStandSnapshot | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(meetingId);
    request.onsuccess = () => resolve(request.result as OfflineStandSnapshot | undefined);
    request.onerror = () => reject(request.error ?? new Error('Unable to load offline snapshot.'));
  });
  db.close();
  return snapshot ?? null;
}
