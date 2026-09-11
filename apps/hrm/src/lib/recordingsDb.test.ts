import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const INTERVIEW_ID = '22222222-2222-4222-8222-222222222222';
const RECORDING_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(),
  deleteRecording: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/app/actions/interviewRecordingActions', () => ({
  createInterviewRecordingUpload: mocks.createUpload,
  deleteInterviewRecording: mocks.deleteRecording,
  finalizeInterviewRecording: mocks.finalize,
  listInterviewRecordings: vi.fn(),
}));

import { deleteSavedRecording, saveRecordingBlob } from './recordingsDb';

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
});
