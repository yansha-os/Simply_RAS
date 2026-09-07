'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  asRecord,
  deriveAtsStage,
  readProgressFromPacket,
} from '@/lib/atsStage';
import {
  canUploadOnboardingCertificate,
  canUseApplicantDeviceSession,
} from '@/lib/applicantAccessPolicy';
import { isCandidateDeviceSessionCurrent } from '@/lib/candidateDeviceSession';
import {
  applicantDocumentMagicBytesMatchMime,
  isAllowedApplicantDocumentMime,
  isCandidateDocumentStoragePath,
  normalizeMimeType,
} from '@/lib/uploadValidation';

const SESSION_COOKIE = 'ras_device_session_token';
const FINGERPRINT_COOKIE = 'device_fingerprint';
const BUCKET = 'ats-applicant-docs';
const MAX_BYTES = 10 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FortyHourCoachStep =
  | 'NOT_STARTED'
  | 'REGISTERED'
  | 'IN_PROGRESS'
  | 'CERT_READY'
  | 'UPLOADED';

export type FortyHourCoachState = {
  step: FortyHourCoachStep;
  registeredAt: string | null;
  inProgressAt: string | null;
  certificateReadyAt: string | null;
  uploadedAt: string | null;
  certFileName: string | null;
  certStoragePath: string | null;
};

const EMPTY_COACH: FortyHourCoachState = {
  step: 'NOT_STARTED',
  registeredAt: null,
  inProgressAt: null,
  certificateReadyAt: null,
  uploadedAt: null,
  certFileName: null,
  certStoragePath: null,
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function readCoach(formData: unknown, certUploaded: boolean): FortyHourCoachState {
  const root = asRecord(formData);
  const coach = asRecord(root.fortyHourCoach);
  const stepRaw = typeof coach.step === 'string' ? coach.step : 'NOT_STARTED';
  const step = (
    ['NOT_STARTED', 'REGISTERED', 'IN_PROGRESS', 'CERT_READY', 'UPLOADED'] as const
  ).includes(stepRaw as FortyHourCoachStep)
    ? (stepRaw as FortyHourCoachStep)
    : 'NOT_STARTED';

  const state: FortyHourCoachState = {
    step,
    registeredAt: typeof coach.registeredAt === 'string' ? coach.registeredAt : null,
    inProgressAt: typeof coach.inProgressAt === 'string' ? coach.inProgressAt : null,
    certificateReadyAt:
      typeof coach.certificateReadyAt === 'string' ? coach.certificateReadyAt : null,
    uploadedAt: typeof coach.uploadedAt === 'string' ? coach.uploadedAt : null,
    certFileName: typeof coach.certFileName === 'string' ? coach.certFileName : null,
    certStoragePath:
      typeof coach.certStoragePath === 'string' ? coach.certStoragePath : null,
  };

  if (certUploaded && state.step !== 'UPLOADED') {
    return { ...state, step: 'UPLOADED', uploadedAt: state.uploadedAt || new Date().toISOString() };
  }
  return state;
}

async function resolveApplicantId(): Promise<
  { ok: true; candidateId: string } | { ok: false; error: string }
> {
  const cookieStore = await cookies();
  const candidateId = cookieStore.get(SESSION_COOKIE)?.value || null;
  const fingerprint = cookieStore.get(FINGERPRINT_COOKIE)?.value || null;

  if (!isUuid(candidateId)) {
    return {
      ok: false,
      error: 'No applicant session. Open your magic link or use Dev Tools.',
    };
  }

  // Cookie-forgery fix (readiness Blocker 0b): always require a live
  // (candidateId, fingerprint, revokedAt IS NULL) device-session row.
  // Dev-tools impersonation is the only exception (never prod).
  if (!fingerprint || !UUID_RE.test(fingerprint)) {
    const { isDevToolsEnabled } = await import('@/lib/devToolsGate');
    if (isDevToolsEnabled()) {
      return { ok: true, candidateId };
    }
    return {
      ok: false,
      error: 'Applicant session is not active on this device. Open your magic link again.',
    };
  }

  const session = await prisma.applicantDeviceSession.findUnique({
    where: {
      candidateId_deviceFingerprint: {
        candidateId,
        deviceFingerprint: fingerprint,
      },
    },
    select: {
      revokedAt: true,
      boundAt: true,
      candidate: {
        select: {
          stage: true,
          activationStatus: true,
        },
      },
    },
  });
  if (
    !session ||
    !isCandidateDeviceSessionCurrent(session) ||
    !canUseApplicantDeviceSession(session.candidate)
  ) {
    return { ok: false, error: 'Applicant session is not active on this device.' };
  }

  return { ok: true, candidateId };
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

export async function getFortyHourCoachState() {
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const packet = await prisma.candidateOnboardingPacket.findUnique({
      where: { candidateId: session.candidateId },
      select: { formData: true, certUploaded: true },
    });

    return {
      success: true as const,
      data: readCoach(packet?.formData, !!packet?.certUploaded),
    };
  } catch (error) {
    console.error(
      'getFortyHourCoachState failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to load course progress.' };
  }
}

export async function markFortyHourCoachStep(
  next: Exclude<FortyHourCoachStep, 'NOT_STARTED' | 'UPLOADED'>
) {
  try {
    if (!['REGISTERED', 'IN_PROGRESS', 'CERT_READY'].includes(next)) {
      return { success: false as const, error: 'Invalid course progress step.' };
    }
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const packet = await prisma.candidateOnboardingPacket.findUnique({
      where: { candidateId: session.candidateId },
      select: { formData: true, certUploaded: true },
    });
    if (!packet) {
      return { success: false as const, error: 'Onboarding packet not found.' };
    }

    const prev = readCoach(packet.formData, packet.certUploaded);
    if (prev.step === 'UPLOADED' || packet.certUploaded) {
      return { success: true as const, data: { ...prev, step: 'UPLOADED' as const } };
    }

    const now = new Date().toISOString();
    const order: FortyHourCoachStep[] = [
      'NOT_STARTED',
      'REGISTERED',
      'IN_PROGRESS',
      'CERT_READY',
      'UPLOADED',
    ];
    const prevIdx = order.indexOf(prev.step);
    const nextIdx = order.indexOf(next);
    // Allow marking current or advancing one step; ignore regressions.
    const step = nextIdx >= prevIdx ? next : prev.step;

    const coach: FortyHourCoachState = {
      ...prev,
      step,
      registeredAt:
        step === 'REGISTERED' || prev.registeredAt
          ? prev.registeredAt || now
          : null,
      inProgressAt:
        step === 'IN_PROGRESS' ||
        step === 'CERT_READY' ||
        prev.inProgressAt
          ? prev.inProgressAt || (nextIdx >= order.indexOf('IN_PROGRESS') ? now : null)
          : null,
      certificateReadyAt:
        step === 'CERT_READY' || prev.certificateReadyAt
          ? prev.certificateReadyAt || (step === 'CERT_READY' ? now : null)
          : null,
    };

    if (step === 'REGISTERED' && !coach.registeredAt) coach.registeredAt = now;
    if (step === 'IN_PROGRESS' && !coach.inProgressAt) coach.inProgressAt = now;
    if (step === 'CERT_READY' && !coach.certificateReadyAt) {
      coach.certificateReadyAt = now;
      if (!coach.inProgressAt) coach.inProgressAt = now;
      if (!coach.registeredAt) coach.registeredAt = now;
    }
    if (step === 'IN_PROGRESS' && !coach.registeredAt) coach.registeredAt = now;

    const formData = {
      ...asRecord(packet.formData),
      fortyHourCoach: coach,
    };

    await prisma.candidateOnboardingPacket.update({
      where: { candidateId: session.candidateId },
      data: { formData },
    });

    revalidatePath('/rbt/documents');
    return { success: true as const, data: coach };
  } catch (error) {
    console.error(
      'markFortyHourCoachStep failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to save progress.' };
  }
}

export async function uploadFortyHourCertificate(formData: FormData) {
  let storageClient: Awaited<ReturnType<typeof getStorageClient>> | null = null;
  let uploadedStoragePath: string | null = null;
  let databaseCommitted = false;
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { success: false as const, error: 'No file selected.' };
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return { success: false as const, error: 'File must be between 1 byte and 10MB.' };
    }
    const mime = normalizeMimeType(file.type);
    if (!isAllowedApplicantDocumentMime(mime)) {
      return {
        success: false as const,
        error: 'Only PDF, JPEG, PNG, or WebP certificates are allowed.',
      };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: session.candidateId },
      include: {
        onboardingPacket: {
          select: {
            formData: true,
            certUploaded: true,
            tasksDone: true,
            availabilityDone: true,
            simulationDone: true,
            interviewBooked: true,
            interviewPassed: true,
            backgroundCleared: true,
            clearedForHire: true,
          },
        },
      },
    });
    if (!candidate?.onboardingPacket) {
      return { success: false as const, error: 'Onboarding packet not found.' };
    }
    if (!canUploadOnboardingCertificate(candidate)) {
      return {
        success: false as const,
        error: 'Certificate upload is not authorized for this candidate status.',
      };
    }

    const storage = await getStorageClient();
    storageClient = storage;
    const storagePath = `${session.candidateId}/40hr-cert-${crypto.randomUUID()}.${extForMime(mime)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!applicantDocumentMagicBytesMatchMime(buffer, mime)) {
      return {
        success: false as const,
        error: 'Certificate content does not match its declared type.',
      };
    }
    const { data: uploaded, error: uploadError } = await storage.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mime, upsert: false });

    if (uploadError || !uploaded?.path) {
      console.error(
        'uploadFortyHourCertificate storage:',
        uploadError?.message || 'Storage returned no object path'
      );
      return {
        success: false as const,
        error: 'Certificate upload could not be stored. Please try again.',
      };
    }
    uploadedStoragePath = uploaded.path;

    const now = new Date().toISOString();
    const prevCoach = readCoach(
      candidate.onboardingPacket.formData,
      candidate.onboardingPacket.certUploaded
    );
    const coach: FortyHourCoachState = {
      ...prevCoach,
      step: 'UPLOADED',
      registeredAt: prevCoach.registeredAt || now,
      inProgressAt: prevCoach.inProgressAt || now,
      certificateReadyAt: prevCoach.certificateReadyAt || now,
      uploadedAt: now,
      certFileName: file.name.slice(0, 200),
      certStoragePath: uploaded.path,
    };

    const formRoot = {
      ...asRecord(candidate.onboardingPacket.formData),
      fortyHourCoach: coach,
    };

    const progress = {
      ...readProgressFromPacket(candidate.onboardingPacket, candidate.dossier),
      certUploaded: true,
    };
    const nextStage = deriveAtsStage({
      activationStatus: candidate.activationStatus,
      currentStage: candidate.stage,
      progress,
    });

    await prisma.atsCandidate.update({
      where: {
        id: session.candidateId,
        stage: candidate.stage,
        activationStatus: candidate.activationStatus,
      },
      data: {
        stage: nextStage,
        dossier: {
          ...asRecord(candidate.dossier),
          progress: {
            ...asRecord(asRecord(candidate.dossier).progress),
            certUploaded: true,
          },
        },
        onboardingPacket: {
          update: {
            certUploaded: true,
            formData: formRoot,
          },
        },
      },
    });
    databaseCommitted = true;

    if (
      prevCoach.certStoragePath &&
      prevCoach.certStoragePath !== uploaded.path &&
      isCandidateDocumentStoragePath(session.candidateId, prevCoach.certStoragePath)
    ) {
      const { error: removalError } = await storage.storage
        .from(BUCKET)
        .remove([prevCoach.certStoragePath]);
      if (removalError) {
        console.error('Failed to remove replaced 40-hour certificate:', removalError.message);
      }
    }

    revalidatePath('/rbt/documents');
    revalidatePath('/ats');
    
    return {
      success: true as const,
      data: coach,
      warning: undefined,
    };
  } catch (error) {
    if (!databaseCommitted && storageClient && uploadedStoragePath) {
      const { error: cleanupError } = await storageClient.storage
        .from(BUCKET)
        .remove([uploadedStoragePath]);
      if (cleanupError) {
        console.error('Failed to clean up uncommitted 40-hour certificate:', cleanupError.message);
      }
    }
    console.error(
      'uploadFortyHourCertificate failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Upload failed. Please try again.' };
  }
}

export async function getEmptyFortyHourCoach(): Promise<FortyHourCoachState> {
  return EMPTY_COACH;
}
