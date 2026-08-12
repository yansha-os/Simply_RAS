import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_RECORDING_MAX_BYTES,
  extensionForMime,
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
