import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_RECORDING_MAX_BYTES,
  applicantDocumentMagicBytesMatchMime,
  extensionForMime,
  isCandidateDocumentStoragePath,
  isInterviewRecordingStoragePath,
  isAllowedRecordingMime,
  magicBytesMatchMime,
  normalizeMimeType,
} from '../uploadValidation';

const WEBM_HEAD = new Uint8Array([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
]);
const MP4_HEAD = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);
const MP3_ID3_HEAD = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
const MP3_FRAME_HEAD = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const WEBP_HEAD = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('normalizeMimeType', () => {
  it('strips codec parameters and lowercases', () => {
    expect(normalizeMimeType('video/webm;codecs=vp8,opus')).toBe('video/webm');
    expect(normalizeMimeType('Video/MP4')).toBe('video/mp4');
    expect(normalizeMimeType('')).toBe('');
  });
});

describe('isAllowedRecordingMime', () => {
  it('allows only the recording formats', () => {
    expect(isAllowedRecordingMime('video/webm')).toBe(true);
    expect(isAllowedRecordingMime('video/mp4')).toBe(true);
    expect(isAllowedRecordingMime('audio/webm')).toBe(true);
    expect(isAllowedRecordingMime('audio/mpeg')).toBe(true);
    expect(isAllowedRecordingMime('application/pdf')).toBe(false);
    expect(isAllowedRecordingMime('text/html')).toBe(false);
    expect(isAllowedRecordingMime('')).toBe(false);
  });
});

describe('extensionForMime', () => {
  it('maps each allowed mime to its extension', () => {
    expect(extensionForMime('video/webm')).toBe('webm');
    expect(extensionForMime('audio/webm')).toBe('webm');
    expect(extensionForMime('video/mp4')).toBe('mp4');
    expect(extensionForMime('audio/mpeg')).toBe('mp3');
  });
});

describe('magicBytesMatchMime', () => {
  it('accepts matching signatures', () => {
    expect(magicBytesMatchMime(WEBM_HEAD, 'video/webm')).toBe(true);
    expect(magicBytesMatchMime(WEBM_HEAD, 'audio/webm')).toBe(true);
    expect(magicBytesMatchMime(MP4_HEAD, 'video/mp4')).toBe(true);
    expect(magicBytesMatchMime(MP3_ID3_HEAD, 'audio/mpeg')).toBe(true);
    expect(magicBytesMatchMime(MP3_FRAME_HEAD, 'audio/mpeg')).toBe(true);
  });

  it('rejects content that does not match the declared mime', () => {
    expect(magicBytesMatchMime(PDF_HEAD, 'video/webm')).toBe(false);
    expect(magicBytesMatchMime(PDF_HEAD, 'video/mp4')).toBe(false);
    expect(magicBytesMatchMime(PDF_HEAD, 'audio/mpeg')).toBe(false);
    expect(magicBytesMatchMime(MP4_HEAD, 'video/webm')).toBe(false);
    expect(magicBytesMatchMime(WEBM_HEAD, 'video/mp4')).toBe(false);
  });

  it('rejects truncated or empty headers', () => {
    expect(magicBytesMatchMime(new Uint8Array(0), 'video/webm')).toBe(false);
    expect(magicBytesMatchMime(new Uint8Array([0x1a, 0x45]), 'video/webm')).toBe(false);
    expect(magicBytesMatchMime(new Uint8Array([0x00, 0x00]), 'video/mp4')).toBe(false);
  });
});

describe('INTERVIEW_RECORDING_MAX_BYTES', () => {
  it('is 50MB', () => {
    expect(INTERVIEW_RECORDING_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe('applicantDocumentMagicBytesMatchMime', () => {
  it('accepts the supported document signatures', () => {
    expect(applicantDocumentMagicBytesMatchMime(PDF_HEAD, 'application/pdf')).toBe(true);
    expect(applicantDocumentMagicBytesMatchMime(JPEG_HEAD, 'image/jpeg')).toBe(true);
    expect(applicantDocumentMagicBytesMatchMime(PNG_HEAD, 'image/png')).toBe(true);
    expect(applicantDocumentMagicBytesMatchMime(WEBP_HEAD, 'image/webp')).toBe(true);
  });

  it('rejects forged and truncated document content', () => {
    expect(applicantDocumentMagicBytesMatchMime(PNG_HEAD, 'application/pdf')).toBe(false);
    expect(applicantDocumentMagicBytesMatchMime(PDF_HEAD, 'image/jpeg')).toBe(false);
    expect(applicantDocumentMagicBytesMatchMime(new Uint8Array([0x89, 0x50]), 'image/png')).toBe(false);
    expect(applicantDocumentMagicBytesMatchMime(new Uint8Array(0), 'image/webp')).toBe(false);
  });
});

describe('isCandidateDocumentStoragePath', () => {
  const candidateId = '11111111-1111-4111-8111-111111111111';
  const objectId = '22222222-2222-4222-8222-222222222222';

  it('accepts server-generated objects inside the expected candidate prefix', () => {
    expect(
      isCandidateDocumentStoragePath(
        candidateId,
        `${candidateId}/resume-${objectId}.pdf`
      )
    ).toBe(true);
    expect(
      isCandidateDocumentStoragePath(
        candidateId,
        `${candidateId}/40hr-cert-${objectId}.webp`
      )
    ).toBe(true);
  });

  it('rejects another candidate prefix, traversal, and unexpected object names', () => {
    const otherCandidate = '33333333-3333-4333-8333-333333333333';
    expect(
      isCandidateDocumentStoragePath(
        candidateId,
        `${otherCandidate}/resume-${objectId}.pdf`
      )
    ).toBe(false);
    expect(
      isCandidateDocumentStoragePath(candidateId, `${candidateId}/../secret.pdf`)
    ).toBe(false);
    expect(
      isCandidateDocumentStoragePath(candidateId, `${candidateId}/arbitrary.pdf`)
    ).toBe(false);
  });
});

describe('isInterviewRecordingStoragePath', () => {
  const candidateId = '11111111-1111-4111-8111-111111111111';
  const interviewId = '22222222-2222-4222-8222-222222222222';
  const recordingId = '33333333-3333-4333-8333-333333333333';

  it('accepts only the canonical server-computed recording path', () => {
    const canonical = `${candidateId}/${interviewId}/${recordingId}.webm`;
    expect(
      isInterviewRecordingStoragePath({
        candidateId,
        interviewId,
        recordingId,
        mimeType: 'video/webm',
        storagePath: canonical,
      })
    ).toBe(true);
    expect(
      isInterviewRecordingStoragePath({
        candidateId,
        interviewId,
        recordingId,
        mimeType: 'video/webm',
        storagePath: `another/${canonical}`,
      })
    ).toBe(false);
  });
});
