import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const INTERVIEW_ID = '22222222-2222-4222-8222-222222222222';
const RECORDING_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(),
  deleteRecording: vi.fn(),
  discardUpload: vi.fn(),
  finalize: vi.fn(),
  listRecordings: vi.fn(),
}));

vi.mock('@/app/actions/interviewRecordingActions', () => ({
  createInterviewRecordingUpload: mocks.createUpload,
  deleteInterviewRecording: mocks.deleteRecording,
  discardUnfinalizedInterviewRecording: mocks.discardUpload,
  finalizeInterviewRecording: mocks.finalize,
  listInterviewRecordings: mocks.listRecordings,
}));

import {
  calculateRecordingDurationSeconds,
  deleteSavedRecording,
  hasPendingRecordingEvidence,
  loadSavedRecordings,
  releaseRecordingCaptureResources,
  releaseLocalRecordingUrl,
  saveRecordingBlob,
} from './recordingsDb';

class SuccessfulUploadRequest {
  status = 200;
  timeout = 0;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  open() {}
  setRequestHeader() {}
  send() { this.onload?.(); }
}

class FailedUploadRequest extends SuccessfulUploadRequest {
  status = 500;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('XMLHttpRequest', SuccessfulUploadRequest);
  mocks.createUpload.mockResolvedValue({
    success: true,
    data: { recordingId: RECORDING_ID, signedUrl: 'https://storage.example.test/upload' },
  });
  mocks.finalize.mockResolvedValue({
    success: true,
    data: {
      id: RECORDING_ID,
      applicantId: CANDIDATE_ID,
      interviewId: INTERVIEW_ID,
      title: 'Interview Take 1',
      url: 'https://storage.example.test/read',
      duration: 30,
      timestamp: '10:00 AM',
      mimeType: 'video/webm',
      byteSize: 8,
    },
  });
  mocks.listRecordings.mockResolvedValue({ success: true, data: [] });
  mocks.discardUpload.mockResolvedValue({ success: true });
});

describe('interview recording durability', () => {
  it('marks only a finalized server recording as durable', async () => {
    const result = await saveRecordingBlob({
      applicantId: CANDIDATE_ID,
      title: 'Interview Take 1',
      blob: new Blob(['recording'], { type: 'video/webm' }),
      duration: 30,
    });

    expect(result).toMatchObject({ success: true, item: { id: RECORDING_ID, durable: true } });
    expect(mocks.finalize).toHaveBeenCalledWith({
      recordingId: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      title: 'Interview Take 1',
      durationSeconds: 30,
      mimeType: 'video/webm',
    });
  });

  it('reports authorization failure instead of presenting a local-only save as successful', async () => {
    mocks.createUpload.mockResolvedValue({ success: false, error: 'Storage unavailable.' });

    const result = await saveRecordingBlob({
      applicantId: CANDIDATE_ID,
      title: 'Interview Take 1',
      blob: new Blob(['recording'], { type: 'video/webm' }),
      duration: 30,
    });

    expect(result).toEqual({ success: false, error: 'Storage unavailable.' });
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.discardUpload).not.toHaveBeenCalled();
  });

  it('removes an uploaded object when secure metadata finalization fails', async () => {
    mocks.finalize.mockResolvedValue({ success: false, error: 'Verification failed.' });

    const result = await saveRecordingBlob({
      applicantId: CANDIDATE_ID,
      title: 'Interview Take 1',
      blob: new Blob(['recording'], { type: 'video/webm' }),
      duration: 30,
    });

    expect(result).toEqual({ success: false, error: 'Verification failed.' });
    expect(mocks.discardUpload).toHaveBeenCalledWith({
      recordingId: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      mimeType: 'video/webm',
    });
  });

  it('attempts temporary-object cleanup after an HTTP upload failure', async () => {
    vi.stubGlobal('XMLHttpRequest', FailedUploadRequest);

    const result = await saveRecordingBlob({
      applicantId: CANDIDATE_ID,
      title: 'Interview Take 1',
      blob: new Blob(['recording'], { type: 'video/webm' }),
      duration: 30,
    });

    expect(result).toEqual({ success: false, error: 'Recording upload failed (HTTP 500).' });
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.discardUpload).toHaveBeenCalledWith({
      recordingId: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      mimeType: 'video/webm',
    });
  });

  it('keeps a durable recording visible when secure deletion is rejected', async () => {
    mocks.deleteRecording.mockResolvedValue({
      success: false,
      error: 'Storage deletion failed. Recording metadata was retained.',
    });

    const result = await deleteSavedRecording({ id: RECORDING_ID, durable: true });

    expect(result).toEqual({
      success: false,
      error: 'Storage deletion failed. Recording metadata was retained.',
    });
    expect(mocks.deleteRecording).toHaveBeenCalledWith(RECORDING_ID);
  });

  it('reports success only after secure deletion is confirmed', async () => {
    mocks.deleteRecording.mockResolvedValue({ success: true });

    const result = await deleteSavedRecording({ id: RECORDING_ID, durable: true });

    expect(result).toEqual({ success: true });
    expect(mocks.deleteRecording).toHaveBeenCalledWith(RECORDING_ID);
  });

  it('distinguishes a secure-recording load failure from an empty archive', async () => {
    mocks.listRecordings.mockResolvedValue({
      success: false,
      error: 'Failed to load recordings.',
      data: [],
    });

    const result = await loadSavedRecordings(CANDIDATE_ID);

    expect(result).toEqual({
      success: false,
      items: [],
      error: 'Failed to load recordings.',
    });
  });

  it('returns an explicit successful empty archive', async () => {
    await expect(loadSavedRecordings(CANDIDATE_ID)).resolves.toEqual({
      success: true,
      items: [],
    });
  });

  it('releases only browser-owned local recording URLs', () => {
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    releaseLocalRecordingUrl({ url: 'blob:https://hrm.example.test/local-take', durable: false });
    releaseLocalRecordingUrl({ url: 'https://storage.example.test/signed-take', durable: true });

    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://hrm.example.test/local-take');
  });

  it('stops each capture track once and closes the audio engine', async () => {
    const stopVideo = vi.fn();
    const stopMic = vi.fn();
    const closeAudio = vi.fn().mockResolvedValue(undefined);
    const sharedVideoTrack = { stop: stopVideo };

    await releaseRecordingCaptureResources({
      streams: [
        { getTracks: () => [sharedVideoTrack] },
        { getTracks: () => [sharedVideoTrack, { stop: stopMic }] },
      ],
      audioContext: { state: 'running', close: closeAudio },
    });

    expect(stopVideo).toHaveBeenCalledOnce();
    expect(stopMic).toHaveBeenCalledOnce();
    expect(closeAudio).toHaveBeenCalledOnce();
  });

  it('derives recording duration from timestamps without interval drift', () => {
    expect(calculateRecordingDurationSeconds(10_000, 75_999)).toBe(65);
    expect(calculateRecordingDurationSeconds(75_999, 10_000)).toBe(0);
    expect(calculateRecordingDurationSeconds(null, 75_999)).toBe(0);
  });

  it('treats active capture and every upload percentage as pending evidence', () => {
    expect(hasPendingRecordingEvidence(true, null)).toBe(true);
    expect(hasPendingRecordingEvidence(false, 0)).toBe(true);
    expect(hasPendingRecordingEvidence(false, 100)).toBe(true);
    expect(hasPendingRecordingEvidence(false, null)).toBe(false);
  });
});
