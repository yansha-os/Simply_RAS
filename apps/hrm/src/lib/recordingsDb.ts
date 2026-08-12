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

/** UI shape for interview takes (Storage-backed; IndexedDB is no longer SoT). */
export interface RecordedVideoItem {
  id: string;
  applicantId: string;
  title: string;
  url: string;
  duration: number;
  timestamp: string;
}

function toItem(dto: InterviewRecordingDto): RecordedVideoItem {
  return {
    id: dto.id,
    applicantId: dto.applicantId,
    title: dto.title,
    url: dto.url,
    duration: dto.duration,
    timestamp: dto.timestamp,
  };
}

export async function getRecordingsFromIDB(
  applicantId: string
): Promise<RecordedVideoItem[]> {
  const res = await listInterviewRecordings(applicantId);
  if (!res.success) {
    console.warn(res.error);
    return [];
  }
  return res.data.map(toItem);
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
    xhr.send(blob);
  });
}

/**
 * Direct-to-storage upload (readiness gap 20): the server action only
 * authorizes (signed upload URL) and finalizes (verifies + records metadata);
 * the video bytes go browser → Supabase Storage, never through a server
 * action body.
 */
export async function saveRecordingBlob(params: {
  applicantId: string;
  title: string;
  blob: Blob;
  duration: number;
  onProgress?: (percent: number) => void;
}): Promise<{ success: boolean; item?: RecordedVideoItem; error?: string }> {
  const mime = normalizeMimeType(params.blob.type) || 'video/webm';

  // Fast client-side pre-checks; the server re-validates everything.
  if (!isAllowedRecordingMime(mime)) {
    return { success: false, error: RECORDING_WRONG_TYPE_ERROR };
  }
  if (params.blob.size <= 0) {
    return { success: false, error: 'Recording is empty.' };
  }
  if (params.blob.size > INTERVIEW_RECORDING_MAX_BYTES) {
    return { success: false, error: RECORDING_TOO_LARGE_ERROR };
  }

  const authz = await createInterviewRecordingUpload({
    candidateId: params.applicantId,
    mimeType: mime,
    byteSize: params.blob.size,
  });
  if (!authz.success || !authz.data) {
    return { success: false, error: authz.error || 'Upload was not authorized.' };
  }

  try {
    const put = await putToSignedUrl(
      authz.data.signedUrl,
      params.blob,
      mime,
      params.onProgress
    );
    if (!put.ok) {
      console.warn('Recording upload to storage failed: HTTP', put.status);
      return { success: false, error: 'Failed to upload recording to storage.' };
    }
  } catch (error) {
    console.warn(
      'Recording upload to storage failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to upload recording to storage.' };
  }

  const res = await finalizeInterviewRecording({
    recordingId: authz.data.recordingId,
    candidateId: params.applicantId,
    title: params.title,
    durationSeconds: params.duration,
    mimeType: mime,
  });
  if (!res.success || !res.data) {
    return { success: false, error: res.error || 'Upload failed' };
  }
  return { success: true, item: toItem(res.data) };
}

/** @deprecated Use saveRecordingBlob — data URLs are not uploaded to Storage. */
export async function saveRecordingToIDB(
  _item: RecordedVideoItem
): Promise<boolean> {
  console.warn(
    'saveRecordingToIDB is deprecated; use saveRecordingBlob with a Blob'
  );
  return false;
}

export async function deleteRecordingFromIDB(
  recordingId: string
): Promise<boolean> {
  const res = await deleteInterviewRecording(recordingId);
  if (!res.success) {
    console.warn(res.error);
    return false;
  }
  return true;
}
