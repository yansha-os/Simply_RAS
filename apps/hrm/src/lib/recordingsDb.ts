'use client';

export interface RecordedVideoItem {
  id: string;
  applicantId: string;
  title: string;
  url: string;
  duration: number;
  timestamp: string;
}

const DB_NAME = 'RiseAndShineCRM_RecordingsDB';
const STORE_NAME = 'interview_recordings';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('applicantId', 'applicantId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecordingToIDB(item: RecordedVideoItem): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(item);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Error saving recording to IndexedDB:', e);
    return false;
  }
}

export async function getRecordingsFromIDB(applicantId: string): Promise<RecordedVideoItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const all: RecordedVideoItem[] = request.result || [];
        const filtered = all.filter(
          (item) => item.applicantId === applicantId || item.applicantId === 'c1' || applicantId === 'c1'
        );
        filtered.sort((a, b) => b.id.localeCompare(a.id));
        resolve(filtered);
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    console.error('Error reading recordings from IndexedDB:', e);
    return [];
  }
}

export async function deleteRecordingFromIDB(recordingId: string): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(recordingId);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Error deleting recording from IndexedDB:', e);
    return false;
  }
}
