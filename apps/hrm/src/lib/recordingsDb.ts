'use client';

import {
  createInterviewRecordingUpload,
  deleteInterviewRecording,
  finalizeInterviewRecording,
  listInterviewRecordings,
  type InterviewRecordingDto,
} from '@/app/actions/interviewRecordingActions';
import {
  INTERVIEW_RECORDING_MAX_BYTES,
  RECORDING_TOO_LARGE_ERROR,
  RECORDING_WRONG_TYPE_ERROR,
  isAllowedRecordingMime,
  normalizeMimeType,
} from '@/lib/uploadValidation';

/** UI shape for durable server takes and legacy local recovery copies. */
export interface RecordedVideoItem {
  id: string;
  applicantId: string;
  title: string;
  url: string;
  duration: number;
  timestamp: string;
  durable: boolean;
}

function toItem(dto: InterviewRecordingDto): RecordedVideoItem {
  return {
    id: dto.id,
    applicantId: dto.applicantId,
    title: dto.title,
    url: dto.url,
    duration: dto.duration,
    timestamp: dto.timestamp,
    durable: true,
  };
}

// --- IndexedDB Native Local Fallback ---

const IDB_NAME = 'AtsInterviewRecordingsDB';
const IDB_VERSION = 1;
const STORE_NAME = 'recordings';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('applicantId', 'applicantId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDBStore(item: {
  id: string;
  applicantId: string;
  title: string;
  duration: number;
  timestamp: string;
  blob: Blob;
}): Promise<RecordedVideoItem> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => {
      const url = URL.createObjectURL(item.blob);
      resolve({
        id: item.id,
        applicantId: item.applicantId,
        title: item.title,
        url,
        duration: item.duration,
        timestamp: item.timestamp,
        durable: false,
      });
    };
    req.onerror = () => reject(req.error);
  });
}

async function getFromIDBStore(applicantId: string): Promise<RecordedVideoItem[]> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('applicantId');
      const req = index.getAll(applicantId);
      req.onsuccess = () => {
        const rows = req.result || [];
        const items = rows.map((row: { id: string; applicantId: string; title: string; duration: number; timestamp: string; blob: Blob }) => ({
          id: row.id,
          applicantId: row.applicantId,
          title: row.title,
          url: URL.createObjectURL(row.blob),
          duration: row.duration,
          timestamp: row.timestamp,
          durable: false,
        }));
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function deleteFromIDBStore(recordingId: string): Promise<boolean> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(recordingId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getRecordingsFromIDB(
  applicantId: string
): Promise<RecordedVideoItem[]> {
  const remotePromise = listInterviewRecordings(applicantId)
    .then((res) => (res.success ? res.data.map(toItem) : []))
    .catch(() => []);

  const localPromise = getFromIDBStore(applicantId);

  const [remoteItems, localItems] = await Promise.all([remotePromise, localPromise]);

  const map = new Map<string, RecordedVideoItem>();
  for (const item of remoteItems) map.set(item.id, item);
  for (const item of localItems) {
    if (!map.has(item.id)) map.set(item.id, item);
  }

  return Array.from(map.values());
}

/** PUT the blob to the signed upload URL with real progress events. */
function putToSignedUrl(
  signedUrl: string,
  blob: Blob,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.timeout = 120_000;
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload was cancelled'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(blob);
  });
}

/** Upload directly to private server storage and finalize durable metadata. */
export async function saveRecordingBlob(params: {
  applicantId: string;
  title: string;
  blob: Blob;
  duration: number;
  onProgress?: (percent: number) => void;
}): Promise<{ success: boolean; item?: RecordedVideoItem; error?: string }> {
  const mime = normalizeMimeType(params.blob.type) || 'video/webm';

  if (!isAllowedRecordingMime(mime)) {
    return { success: false, error: RECORDING_WRONG_TYPE_ERROR };
  }
  if (params.blob.size <= 0) {
    return { success: false, error: 'Recording is empty.' };
  }
  if (params.blob.size > INTERVIEW_RECORDING_MAX_BYTES) {
    return { success: false, error: RECORDING_TOO_LARGE_ERROR };
  }

  // Interview recordings are sensitive evidence: only secure server storage
  // counts as a successful save. Legacy IndexedDB entries remain readable so
  // staff can identify and delete older recovery copies.
  try {
    const authz = await createInterviewRecordingUpload({
      candidateId: params.applicantId,
      mimeType: mime,
      byteSize: params.blob.size,
    });
    if (!authz.success || !authz.data) {
      return { success: false, error: authz.error || 'Recording upload could not be authorized.' };
    }

    const put = await putToSignedUrl(
      authz.data.signedUrl,
      params.blob,
      mime,
      params.onProgress
    );
    if (!put.ok) {
      return { success: false, error: `Recording upload failed (HTTP ${put.status}).` };
    }

    const finalized = await finalizeInterviewRecording({
      recordingId: authz.data.recordingId,
      candidateId: params.applicantId,
      title: params.title,
      durationSeconds: params.duration,
      mimeType: mime,
    });
    if (!finalized.success || !finalized.data) {
      return { success: false, error: finalized.error || 'Recording upload could not be finalized.' };
    }

    return { success: true, item: toItem(finalized.data) };
  } catch (error) {
    console.warn(
      'Remote recording storage upload failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      error: 'Recording was not saved to secure server storage. Check the connection and retry.',
    };
  }
}

/** Legacy wrapper kept for backward compatibility. */
export async function saveRecordingToIDB(
  item: RecordedVideoItem
): Promise<boolean> {
  try {
    const res = await fetch(item.url);
    const blob = await res.blob();
    await saveToIDBStore({
      id: item.id,
      applicantId: item.applicantId,
      title: item.title,
      duration: item.duration,
      timestamp: item.timestamp,
      blob,
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteRecordingFromIDB(
  recordingId: string
): Promise<boolean> {
  await deleteInterviewRecording(recordingId).catch(() => {});
  await deleteFromIDBStore(recordingId).catch(() => {});
  return true;
}
