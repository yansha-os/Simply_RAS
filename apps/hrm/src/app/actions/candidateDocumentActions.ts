'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth-guard';
import type { Prisma, Role } from '@repo/db';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canUseCandidateDocumentToken } from '@/lib/applicantAccessPolicy';
import {
  applicantDocumentMagicBytesMatchMime,
  isCandidateDocumentStoragePath,
  isAllowedApplicantDocumentMime,
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

const BUCKET = 'ats-applicant-docs';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 60 * 60;

export type CandidateDocumentsDto = {
  candidateId: string;
  resumeFileName: string | null;
  resumeUrl: string | null;
  govtIdFileName: string | null;
  govtIdUrl: string | null;
  dossier: Record<string, unknown>;
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

async function getStorageClient() {
  const admin = createAdminClient();
  if (admin) return admin;
  return createClient();
}

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'pdf';
}

async function signedUrl(
  client: Awaited<ReturnType<typeof getStorageClient>>,
  candidateId: string,
  path: string | null | undefined
): Promise<string | null> {
  if (!isCandidateDocumentStoragePath(candidateId, path)) return null;
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function uploadOne(
  client: Awaited<ReturnType<typeof getStorageClient>>,
  candidateId: string,
  kind: 'resume' | 'govt-id' | '40hr-cert',
  file: File
): Promise<{ fileName: string; storagePath: string } | { error: string }> {
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return { error: `${kind} must be between 1 byte and 10MB.` };
  }
  const mime = normalizeMimeType(file.type);
  if (!isAllowedApplicantDocumentMime(mime)) {
    return { error: `${kind}: only PDF, JPEG, PNG, or WebP are allowed.` };
  }
  const storagePath = `${candidateId}/${kind}-${crypto.randomUUID()}.${extForMime(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!applicantDocumentMagicBytesMatchMime(buffer, mime)) {
    return { error: `${kind}: file content does not match its declared type.` };
  }
  const { error } = await client.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    console.error(`uploadOne(${kind}) failed:`, error.message);
    return { error: `Failed to upload ${kind}.` };
  }
  return {
    fileName: file.name.slice(0, 200),
    storagePath,
  };
}

/**
 * Public (token-gated): attach resume / gov ID after apply creates the candidate.
 * Requires onboarding packet magicLinkToken as uploadToken.
 */
export async function attachApplicantDocuments(
  candidateId: string,
  uploadToken: string,
  formData: FormData
) {
  let storageClient: Awaited<ReturnType<typeof getStorageClient>> | null = null;
  const newlyUploadedPaths: string[] = [];
  let packetCommitted = false;
  try {
    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate id.' };
    }
    if (!uploadToken || uploadToken.length > 128) {
      return { success: false as const, error: 'Invalid upload token.' };
    }

    const packet = await prisma.candidateOnboardingPacket.findFirst({
      where: { candidateId, magicLinkToken: uploadToken },
      select: {
        id: true,
        resumeStoragePath: true,
        govtIdStoragePath: true,
        formData: true,
        magicLinkExpiresAt: true,
        magicLinkRevokedAt: true,
        candidate: {
          select: {
            stage: true,
            activationStatus: true,
          },
        },
      },
    });
    if (!packet) {
      return { success: false as const, error: 'Upload not authorized for this application.' };
    }
    if (packet.magicLinkRevokedAt) {
      return { success: false as const, error: 'This upload link has been revoked.' };
    }
    if (packet.magicLinkExpiresAt) {
      const expiry =
        packet.magicLinkExpiresAt instanceof Date
          ? packet.magicLinkExpiresAt.getTime()
          : new Date(packet.magicLinkExpiresAt).getTime();
      if (!isNaN(expiry) && expiry < Date.now()) {
        return { success: false as const, error: 'This upload link has expired.' };
      }
    }
    if (!canUseCandidateDocumentToken(packet.candidate)) {
      return {
        success: false as const,
        error: 'Upload not authorized for this candidate status.',
      };
    }

    const resume = formData.get('resume');
    const govtId = formData.get('govtId');
    const fortyHourCert = formData.get('fortyHourCert');
    if (
      !(resume instanceof File) &&
      !(govtId instanceof File) &&
      !(fortyHourCert instanceof File)
    ) {
      return { success: false as const, error: 'No documents provided.' };
    }
    const requestedFiles = [resume, govtId, fortyHourCert].filter(
      (value): value is File => value instanceof File && value.size > 0
    );
    const requestBytes = requestedFiles.reduce((total, file) => total + file.size, 0);
    if (requestBytes > MAX_REQUEST_BYTES) {
      return {
        success: false as const,
        error: 'Combined document upload must not exceed 20MB.',
      };
    }

    const admin = createAdminClient();
    const client = await getStorageClient();
    storageClient = client;
    if (!admin) {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        return {
          success: false as const,
          error:
            'Document upload requires SUPABASE_SERVICE_ROLE_KEY on the server (public apply has no Auth session).',
        };
      }
    }

    const updates: {
      resumeFileName?: string;
      resumeStoragePath?: string;
      govtIdFileName?: string;
      govtIdStoragePath?: string;
      certUploaded?: boolean;
      formData?: Prisma.InputJsonValue;
    } = {};

    if (resume instanceof File && resume.size > 0) {
      const result = await uploadOne(client, candidateId, 'resume', resume);
      if ('error' in result) return { success: false as const, error: result.error };
      newlyUploadedPaths.push(result.storagePath);
      updates.resumeFileName = result.fileName;
      updates.resumeStoragePath = result.storagePath;
    }

    if (govtId instanceof File && govtId.size > 0) {
      const result = await uploadOne(client, candidateId, 'govt-id', govtId);
      if ('error' in result) {
        if (newlyUploadedPaths.length > 0) {
          await client.storage.from(BUCKET).remove(newlyUploadedPaths);
        }
        return { success: false as const, error: result.error };
      }
      newlyUploadedPaths.push(result.storagePath);
      updates.govtIdFileName = result.fileName;
      updates.govtIdStoragePath = result.storagePath;
    }

    let fortyHourCertFileName: string | null = null;
    if (fortyHourCert instanceof File && fortyHourCert.size > 0) {
      const result = await uploadOne(client, candidateId, '40hr-cert', fortyHourCert);
      if ('error' in result) {
        if (newlyUploadedPaths.length > 0) {
          await client.storage.from(BUCKET).remove(newlyUploadedPaths);
        }
        return { success: false as const, error: result.error };
      }
      newlyUploadedPaths.push(result.storagePath);
      fortyHourCertFileName = result.fileName;
      const now = new Date().toISOString();
      const prevForm =
        packet.formData && typeof packet.formData === 'object' && !Array.isArray(packet.formData)
          ? (packet.formData as Record<string, unknown>)
          : {};
      updates.certUploaded = true;
      updates.formData = {
        ...prevForm,
        fortyHourCoach: {
          step: 'UPLOADED',
          registeredAt: now,
          inProgressAt: now,
          certificateReadyAt: now,
          uploadedAt: now,
          certFileName: result.fileName,
          certStoragePath: result.storagePath,
          source: 'APPLICATION',
        },
      } as Prisma.InputJsonValue;
    }

    if (Object.keys(updates).length === 0) {
      return { success: false as const, error: 'No valid documents to upload.' };
    }

    const committed = await prisma.candidateOnboardingPacket.updateMany({
      where: {
        id: packet.id,
        magicLinkToken: uploadToken,
        magicLinkRevokedAt: null,
        magicLinkExpiresAt: packet.magicLinkExpiresAt,
        candidate: {
          is: {
            stage: packet.candidate.stage,
            activationStatus: packet.candidate.activationStatus,
          },
        },
      },
      data: updates,
    });
    if (committed.count !== 1) {
      if (newlyUploadedPaths.length > 0) {
        await client.storage.from(BUCKET).remove(newlyUploadedPaths);
      }
      return {
        success: false as const,
        error: 'Upload authorization changed. Open the current link and try again.',
      };
    }
    packetCommitted = true;

    const replacedPaths = [
      ...(updates.resumeStoragePath && packet.resumeStoragePath
        && isCandidateDocumentStoragePath(candidateId, packet.resumeStoragePath)
        ? [packet.resumeStoragePath]
        : []),
      ...(updates.govtIdStoragePath && packet.govtIdStoragePath
        && isCandidateDocumentStoragePath(candidateId, packet.govtIdStoragePath)
        ? [packet.govtIdStoragePath]
        : []),
    ];
    if (replacedPaths.length > 0) {
      const { error: removalError } = await client.storage
        .from(BUCKET)
        .remove(replacedPaths);
      if (removalError) {
        console.error('Failed to remove replaced applicant documents:', removalError.message);
      }
    }

    // Keep filename hints on dossier for list UIs
    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: { dossier: true },
    });
    const dossier =
      candidate?.dossier && typeof candidate.dossier === 'object'
        ? (candidate.dossier as Record<string, unknown>)
        : {};
    await prisma.atsCandidate.update({
      where: { id: candidateId },
      data: {
        dossier: {
          ...dossier,
          ...(updates.resumeFileName ? { resumeFileName: updates.resumeFileName } : {}),
          ...(updates.govtIdFileName ? { govtIdFileName: updates.govtIdFileName } : {}),
          ...(fortyHourCertFileName
            ? {
                fortyHourCertFileName,
                progress: {
                  ...(dossier.progress && typeof dossier.progress === 'object'
                    ? (dossier.progress as Record<string, unknown>)
                    : {}),
                  certUploaded: true,
                },
              }
            : {}),
        },
      },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);
    revalidatePath('/ats');

    return { success: true as const };
  } catch (error) {
    if (!packetCommitted && storageClient && newlyUploadedPaths.length > 0) {
      const { error: cleanupError } = await storageClient.storage
        .from(BUCKET)
        .remove(newlyUploadedPaths);
      if (cleanupError) {
        console.error('Failed to clean up uncommitted applicant documents:', cleanupError.message);
      }
    }
    console.error(
      'attachApplicantDocuments failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to attach documents. Please try again.',
    };
  }
}

/** Staff: signed URLs + dossier for ATS applicant dossier tab. */
export async function getCandidateDocuments(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate id.', data: null };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        dossier: true,
        onboardingPacket: {
          select: {
            resumeFileName: true,
            resumeStoragePath: true,
            govtIdFileName: true,
            govtIdStoragePath: true,
            formData: true,
          },
        },
      },
    });

    if (!candidate) {
      return { success: false as const, error: 'Candidate not found.', data: null };
    }

    const packet = candidate.onboardingPacket;
    const dossier =
      candidate.dossier && typeof candidate.dossier === 'object'
        ? (candidate.dossier as Record<string, unknown>)
        : {};
    const formData =
      packet?.formData && typeof packet.formData === 'object'
        ? (packet.formData as Record<string, unknown>)
        : {};

    const client = await getStorageClient();
    const resumeUrl = await signedUrl(client, candidate.id, packet?.resumeStoragePath);
    const govtIdUrl = await signedUrl(client, candidate.id, packet?.govtIdStoragePath);

    const data: CandidateDocumentsDto = {
      candidateId: candidate.id,
      resumeFileName:
        packet?.resumeFileName ||
        (typeof dossier.resumeFileName === 'string' ? dossier.resumeFileName : null),
      resumeUrl,
      govtIdFileName:
        packet?.govtIdFileName ||
        (typeof dossier.govtIdFileName === 'string' ? dossier.govtIdFileName : null),
      govtIdUrl,
      dossier: { ...formData, ...dossier },
    };

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'getCandidateDocuments failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to load documents.',
      data: null,
    };
  }
}
