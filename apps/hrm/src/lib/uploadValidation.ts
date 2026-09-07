/**
 * Validation rules for interview-recording uploads (readiness gap 20).
 *
 * Pure logic only (no IO) so it is unit-testable and shareable between the
 * server actions that authorize/finalize uploads and any client pre-checks.
 */

/** Hard cap for a single interview take. Assumption: 50MB covers ~45–60 min
 * of vp8/opus webm screen recording at typical interview bitrates; the file
 * no longer flows through the server-action body, so the cap protects
 * storage costs rather than server memory. */
export const INTERVIEW_RECORDING_MAX_BYTES = 50 * 1024 * 1024;
export const INTERVIEW_RECORDING_MAX_MB = 50;

export const APPLICANT_DOCUMENT_ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ApplicantDocumentMime =
  (typeof APPLICANT_DOCUMENT_ALLOWED_MIME)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPLICANT_OBJECT_PATTERN =
  /^(resume|govt-id|40hr-cert|onboarding-[a-z0-9_-]+)-[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;

/**
 * Storage paths are authorization data. Never sign or remove a path loaded
 * from mutable JSON/database metadata unless it remains inside the expected
 * candidate prefix and matches a server-generated applicant object name.
 */
export function isCandidateDocumentStoragePath(
  candidateId: string,
  storagePath: string | null | undefined
): storagePath is string {
  if (!UUID_PATTERN.test(candidateId) || !storagePath) return false;
  const prefix = `${candidateId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  return APPLICANT_OBJECT_PATTERN.test(storagePath.slice(prefix.length));
}

export function isInterviewRecordingStoragePath(input: {
  candidateId: string;
  interviewId: string;
  recordingId: string;
  mimeType: string;
  storagePath: string;
}): boolean {
  if (
    !UUID_PATTERN.test(input.candidateId) ||
    !UUID_PATTERN.test(input.interviewId) ||
    !UUID_PATTERN.test(input.recordingId) ||
    !isAllowedRecordingMime(input.mimeType)
  ) {
    return false;
  }
  return (
    input.storagePath ===
    `${input.candidateId}/${input.interviewId}/${input.recordingId}.${extensionForMime(input.mimeType)}`
  );
}

/** Shared user-facing failure messages (client pre-check + server rejection). */
export const RECORDING_TOO_LARGE_ERROR = `Recording is too large — the maximum is ${INTERVIEW_RECORDING_MAX_MB}MB.`;
export const RECORDING_WRONG_TYPE_ERROR =
  'Unsupported recording type. Only webm/mp4 video or webm/mpeg audio is allowed.';

export const INTERVIEW_RECORDING_ALLOWED_MIME = [
  'video/webm',
  'video/mp4',
  'audio/webm',
  'audio/mpeg',
] as const;

export type InterviewRecordingMime =
  (typeof INTERVIEW_RECORDING_ALLOWED_MIME)[number];

/** Strip codec parameters (e.g. "video/webm;codecs=vp8,opus") and lowercase. */
export function normalizeMimeType(raw: string): string {
  return (raw || '').split(';')[0].trim().toLowerCase();
}

export function isAllowedRecordingMime(
  mime: string
): mime is InterviewRecordingMime {
  return (INTERVIEW_RECORDING_ALLOWED_MIME as readonly string[]).includes(mime);
}

export function isAllowedApplicantDocumentMime(
  mime: string
): mime is ApplicantDocumentMime {
  return (APPLICANT_DOCUMENT_ALLOWED_MIME as readonly string[]).includes(mime);
}

export function extensionForMime(mime: InterviewRecordingMime): string {
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'audio/mpeg') return 'mp3';
  return 'webm';
}

/** How many leading bytes are needed to sniff any supported signature. */
export const MAGIC_BYTES_LENGTH = 16;

function isEbml(bytes: Uint8Array): boolean {
  // WebM (and Matroska) files start with the EBML header 1A 45 DF A3.
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

function isMp4(bytes: Uint8Array): boolean {
  // ISO BMFF: bytes 4-7 spell "ftyp".
  return (
    bytes.length >= 8 &&
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  );
}

function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  // ID3v2 tag prefix.
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // Bare MPEG audio frame sync: 11 set bits.
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/**
 * Verify the file's leading bytes match the signature of the declared MIME
 * type. Prevents a renamed/forged Content-Type from smuggling arbitrary file
 * content into the recordings bucket.
 */
export function magicBytesMatchMime(
  bytes: Uint8Array,
  mime: InterviewRecordingMime
): boolean {
  switch (mime) {
    case 'video/webm':
    case 'audio/webm':
      return isEbml(bytes);
    case 'video/mp4':
      return isMp4(bytes);
    case 'audio/mpeg':
      return isMp3(bytes);
    default:
      return false;
  }
}

/** Verify that an applicant document's content matches its declared MIME type. */
export function applicantDocumentMagicBytesMatchMime(
  bytes: Uint8Array,
  mime: ApplicantDocumentMime
): boolean {
  switch (mime) {
    case 'application/pdf':
      return (
        bytes.length >= 5 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46 &&
        bytes[4] === 0x2d
      );
    case 'image/jpeg':
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case 'image/png':
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    default:
      return false;
  }
}
