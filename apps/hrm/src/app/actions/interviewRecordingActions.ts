'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth-guard';
import type { Role } from '@repo/db';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  INTERVIEW_RECORDING_MAX_BYTES,
  MAGIC_BYTES_LENGTH,
  RECORDING_TOO_LARGE_ERROR,
  RECORDING_WRONG_TYPE_ERROR,
  extensionForMime,
  isAllowedRecordingMime,
  isInterviewRecordingStoragePath,
  magicBytesMatchMime,
  normalizeMimeType,
} from '@/lib/uploadValidation';

const ATS_STAFF_ROLES = [
  'HEAD_HR',
  'HR',
  'HR_AGENT',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUCKET = 'ats-interview-recordings';
const MAX_BYTES = INTERVIEW_RECORDING_MAX_BYTES;
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

export type InterviewRecordingDto = {
  id: string;
  applicantId: string;
  interviewId: string;
  title: string;
  url: string;
  duration: number;
  timestamp: string;
  mimeType: string;
  byteSize: number | null;
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

async function getStorageClient() {
  const admin = createAdminClient();
  if (admin) return { client: admin, mode: 'service' as const };

  const userClient = await createClient();
  return { client: userClient, mode: 'user' as const };
}

async function ensureInterview(candidateId: string) {
  return prisma.atsInterview.upsert({
    where: { candidateId },
    update: {},
    create: {
      candidateId,
      status: 'IN_PROGRESS',
    },
    select: { id: true },
  });
}

async function signedUrlFor(
  client: Awaited<ReturnType<typeof getStorageClient>>['client'],
  path: string,
  bucket = BUCKET
): Promise<string> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to create signed URL');
  }
  return data.signedUrl;
}

export async function listInterviewRecordings(candidateId: string) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) {
    return { success: false as const, error: gate.error, data: [] as InterviewRecordingDto[] };
  }

  try {
    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate id.', data: [] as InterviewRecordingDto[] };
    }

    const rows = await prisma.atsInterviewRecording.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });

    if (rows.length === 0) {
      return { success: true as const, data: [] as InterviewRecordingDto[] };
    }

    const { client } = await getStorageClient();
    const data: InterviewRecordingDto[] = [];
    let unavailableCount = 0;

    for (const row of rows) {
      try {
        if (
          row.storageBucket !== BUCKET ||
          !isInterviewRecordingStoragePath({
            candidateId: row.candidateId,
            interviewId: row.interviewId,
            recordingId: row.id,
            mimeType: row.mimeType,
            storagePath: row.storagePath,
          })
        ) {
          unavailableCount += 1;
          continue;
        }
        const url = await signedUrlFor(client, row.storagePath, row.storageBucket);
        data.push({
          id: row.id,
          applicantId: row.candidateId,
          interviewId: row.interviewId,
          title: row.title,
          url,
          duration: row.durationSeconds,
          timestamp: row.createdAt.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          mimeType: row.mimeType,
          byteSize: row.byteSize != null ? Number(row.byteSize) : null,
        });
      } catch {
        unavailableCount += 1;
      }
    }

    if (unavailableCount > 0) {
      return {
        success: false as const,
        error: `${unavailableCount} secure recording${unavailableCount === 1 ? '' : 's'} could not be loaded.`,
        data,
      };
    }

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'listInterviewRecordings failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to load recordings.',
      data: [] as InterviewRecordingDto[],
    };
  }
}

/**
 * Read the leading bytes + total size of a stored object without downloading
 * it, via a short-lived signed URL and an HTTP Range request. Falls back
 * gracefully if the storage host ignores Range (reads only the first chunk).
 */
async function readObjectHead(
  client: Awaited<ReturnType<typeof getStorageClient>>['client'],
  path: string
): Promise<{ bytes: Uint8Array; totalSize: number | null } | null> {
  try {
    const { data, error } = await client.storage
      .from(BUCKET)
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${MAGIC_BYTES_LENGTH - 1}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;

    let totalSize: number | null = null;
    const contentRange = res.headers.get('content-range');
    if (contentRange) {
      const total = Number(contentRange.split('/')[1]);
      if (Number.isFinite(total)) totalSize = total;
    } else {
      const contentLength = Number(res.headers.get('content-length'));
      if (Number.isFinite(contentLength)) totalSize = contentLength;
    }

    const bytes = new Uint8Array(MAGIC_BYTES_LENGTH);
    let bytesRead = 0;
    const reader = res.body?.getReader();
    if (reader) {
      while (bytesRead < MAGIC_BYTES_LENGTH) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const remaining = MAGIC_BYTES_LENGTH - bytesRead;
        const slice = chunk.value.subarray(0, remaining);
        bytes.set(slice, bytesRead);
        bytesRead += slice.length;
      }
      await reader.cancel();
    } else {
      const buf = await res.arrayBuffer();
      const slice = new Uint8Array(buf.slice(0, MAGIC_BYTES_LENGTH));
      bytes.set(slice);
      bytesRead = slice.length;
    }
    return { bytes: bytes.subarray(0, bytesRead), totalSize };
  } catch {
    return null;
  }
}

/**
 * Step 1 of the direct-to-storage upload: authorize a browser upload by
 * issuing a single-use signed upload URL for a server-chosen storage path.
 * The recording blob never passes through a server action body, so no
 * oversized `serverActions.bodySizeLimit` is required.
 */
export async function createInterviewRecordingUpload(input: {
  candidateId: string;
  mimeType: string;
  byteSize: number;
}) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const candidateId = String(input.candidateId || '');
    const mimeType = normalizeMimeType(String(input.mimeType || ''));
    const byteSize = Number(input.byteSize) || 0;

    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate id. Use a real ATS candidate UUID.' };
    }
    if (!isAllowedRecordingMime(mimeType)) {
      return { success: false as const, error: RECORDING_WRONG_TYPE_ERROR };
    }
    if (byteSize <= 0) {
      return { success: false as const, error: 'Recording is empty.' };
    }
    if (byteSize > MAX_BYTES) {
      return { success: false as const, error: RECORDING_TOO_LARGE_ERROR };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (!candidate) {
      return { success: false as const, error: 'Candidate not found.' };
    }

    const interview = await ensureInterview(candidateId);
    const recordingId = crypto.randomUUID();
    const storagePath = `${candidateId}/${interview.id}/${recordingId}.${extensionForMime(mimeType)}`;

    const admin = createAdminClient();
    const { client, mode } = await getStorageClient();
    if (mode === 'user' && !admin) {
      const {
        data: { user: authUser },
      } = await client.auth.getUser();
      if (!authUser) {
        return {
          success: false as const,
          error:
            'Storage upload requires SUPABASE_SERVICE_ROLE_KEY (server) or a real staff login session.',
        };
      }
    }

    const { data, error } = await client.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data?.token || !data.signedUrl) {
      console.error(
        'createInterviewRecordingUpload signed URL failed:',
        error?.message || 'No token'
      );
      return {
        success: false as const,
        error: 'Failed to authorize the upload. Please try again.',
      };
    }

    return {
      success: true as const,
      data: {
        bucket: BUCKET,
        path: data.path,
        token: data.token,
        signedUrl: data.signedUrl,
        recordingId,
      },
    };
  } catch (error) {
    console.error(
      'createInterviewRecordingUpload failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to authorize the upload. Please try again.',
    };
  }
}

/**
 * Step 2: after the browser uploads directly to storage, verify the object
 * server-side (exists, size within limits, magic bytes match the declared
 * MIME type) and record metadata. Invalid objects are deleted from storage.
 */
export async function finalizeInterviewRecording(input: {
  recordingId: string;
  candidateId: string;
  title?: string;
  durationSeconds?: number;
  mimeType: string;
}) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const recordingId = String(input.recordingId || '');
    const candidateId = String(input.candidateId || '');
    const titleRaw = String(input.title || 'Interview Take').slice(0, 120);
    const durationSeconds = Math.max(
      0,
      Math.min(24 * 60 * 60, Number(input.durationSeconds || 0) || 0)
    );
    const mimeType = normalizeMimeType(String(input.mimeType || ''));

    if (!isUuid(candidateId) || !isUuid(recordingId)) {
      return { success: false as const, error: 'Invalid candidate or recording id.' };
    }
    if (!isAllowedRecordingMime(mimeType)) {
      return { success: false as const, error: RECORDING_WRONG_TYPE_ERROR };
    }

    const existing = await prisma.atsInterviewRecording.findUnique({
      where: { id: recordingId },
      select: { id: true },
    });
    if (existing) {
      return { success: false as const, error: 'Recording already saved.' };
    }

    const interview = await prisma.atsInterview.findUnique({
      where: { candidateId },
      select: { id: true },
    });
    if (!interview) {
      return { success: false as const, error: 'Interview not found for candidate.' };
    }

    // Recompute the path server-side — never trust a client-supplied path.
    const storagePath = `${candidateId}/${interview.id}/${recordingId}.${extensionForMime(mimeType)}`;

    const { client } = await getStorageClient();
    const head = await readObjectHead(client, storagePath);
    if (!head) {
      return {
        success: false as const,
        error: 'Uploaded recording was not found in storage.',
      };
    }

    if (
      head.totalSize == null ||
      head.totalSize <= 0 ||
      head.totalSize > MAX_BYTES
    ) {
      await client.storage.from(BUCKET).remove([storagePath]);
      return {
        success: false as const,
        error:
          head.totalSize != null && head.totalSize > MAX_BYTES
            ? RECORDING_TOO_LARGE_ERROR
            : 'Recording is empty or its size could not be verified.',
      };
    }

    if (!magicBytesMatchMime(head.bytes, mimeType)) {
      await client.storage.from(BUCKET).remove([storagePath]);
      return { success: false as const, error: RECORDING_WRONG_TYPE_ERROR };
    }

    // Prove the verified object is readable before committing durable metadata.
    // Otherwise a signed-URL failure after `create` would report a failed save
    // even though the recording row already exists.
    const url = await signedUrlFor(client, storagePath);
    const createdByUserId = isUuid(gate.user.id) ? gate.user.id : null;

    const row = await prisma.atsInterviewRecording.create({
      data: {
        id: recordingId,
        interviewId: interview.id,
        candidateId,
        title: titleRaw || 'Interview Take',
        storageBucket: BUCKET,
        storagePath,
        mimeType,
        durationSeconds,
        byteSize: BigInt(head.totalSize),
        createdByUserId,
      },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);

    const dto: InterviewRecordingDto = {
      id: row.id,
      applicantId: row.candidateId,
      interviewId: row.interviewId,
      title: row.title,
      url,
      duration: row.durationSeconds,
      timestamp: row.createdAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      mimeType: row.mimeType,
      byteSize: Number(row.byteSize),
    };

    return { success: true as const, data: dto };
  } catch (error) {
    console.error(
      'finalizeInterviewRecording failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to save recording. Please try again.',
    };
  }
}

export async function discardUnfinalizedInterviewRecording(input: {
  recordingId: string;
  candidateId: string;
  mimeType: string;
}) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const recordingId = String(input.recordingId || '');
    const candidateId = String(input.candidateId || '');
    const mimeType = normalizeMimeType(String(input.mimeType || ''));
    if (!isUuid(recordingId) || !isUuid(candidateId) || !isAllowedRecordingMime(mimeType)) {
      return { success: false as const, error: 'Invalid recording cleanup request.' };
    }

    const finalized = await prisma.atsInterviewRecording.findUnique({
      where: { id: recordingId },
      select: { id: true },
    });
    if (finalized) {
      return { success: false as const, error: 'Finalized recordings cannot be discarded as temporary uploads.' };
    }

    const interview = await prisma.atsInterview.findUnique({
      where: { candidateId },
      select: { id: true },
    });
    if (!interview) {
      return { success: false as const, error: 'Interview not found for recording cleanup.' };
    }

    const storagePath = `${candidateId}/${interview.id}/${recordingId}.${extensionForMime(mimeType)}`;
    const { client } = await getStorageClient();
    const { error } = await client.storage.from(BUCKET).remove([storagePath]);
    if (error) {
      console.error('discardUnfinalizedInterviewRecording storage failed:', error.message);
      return { success: false as const, error: 'Temporary recording cleanup failed.' };
    }

    return { success: true as const };
  } catch (error) {
    console.error(
      'discardUnfinalizedInterviewRecording failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Temporary recording cleanup failed.' };
  }
}

export async function deleteInterviewRecording(recordingId: string) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    if (!isUuid(recordingId)) {
      return { success: false as const, error: 'Invalid recording id.' };
    }

    const row = await prisma.atsInterviewRecording.findUnique({
      where: { id: recordingId },
    });
    if (!row) {
      return { success: false as const, error: 'Recording not found.' };
    }
    if (
      row.storageBucket !== BUCKET ||
      !isInterviewRecordingStoragePath({
        candidateId: row.candidateId,
        interviewId: row.interviewId,
        recordingId: row.id,
        mimeType: row.mimeType,
        storagePath: row.storagePath,
      })
    ) {
      return { success: false as const, error: 'Recording storage metadata is invalid.' };
    }

    const { client } = await getStorageClient();
    const { error: storageError } = await client.storage
      .from(row.storageBucket)
      .remove([row.storagePath]);

    if (storageError) {
      console.error(
        'deleteInterviewRecording storage failed:',
        storageError.message
      );
      return {
        success: false as const,
        error: 'Storage deletion failed. The recording remains tracked so deletion can be retried.',
      };
    }

    await prisma.atsInterviewRecording.delete({ where: { id: recordingId } });

    revalidatePath(`/ats/applicant/${row.candidateId}`);
    
    return { success: true as const };
  } catch (error) {
    console.error(
      'deleteInterviewRecording failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to delete recording.',
    };
  }
}
