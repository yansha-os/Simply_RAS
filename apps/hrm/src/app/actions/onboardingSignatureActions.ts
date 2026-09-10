'use server';

import { createHash } from 'crypto';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-guard';
import type { Prisma, Role } from '@repo/db';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getOnboardingDoc,
  HARASSMENT_QUIZ,
  HARASSMENT_QUIZ_PASS_PCT,
  ONBOARDING_COMPLETION_EVENT_FILTERS,
  ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboardingDocuments';
import {
  normalizeForStorage,
  redactForAudit,
  validateEmbeddedForm,
  type EmbeddedFormPayload,
} from '@/lib/embeddedOnboardingForms';
import { protectOnboardingFormForStorage } from '@/lib/onboardingSensitiveStorage';
import { canUseApplicantDeviceSession } from '@/lib/applicantAccessPolicy';
import {
  applicantDocumentMagicBytesMatchMime,
  isAllowedApplicantDocumentMime,
  normalizeMimeType,
} from '@/lib/uploadValidation';
import { isCandidateDeviceSessionCurrent } from '@/lib/candidateDeviceSession';

const ATS_STAFF_ROLES = [
  'HEAD_HR',
  'HR',
  'HR_AGENT',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];
const AUDIT_EXPORT_ROLES = ['HEAD_HR', 'CEO', 'ADMIN', 'SUPER_ADMIN'] as Role[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COOKIE = 'ras_device_session_token';
const FINGERPRINT_COOKIE = 'device_fingerprint';
const BUCKET = 'ats-applicant-docs';
const MAX_BYTES = 10 * 1024 * 1024;

export type OnboardingActionType =
  | 'DOWNLOADED'
  | 'SIGNED'
  | 'UPLOADED'
  | 'FORM_SUBMITTED'
  | 'QUIZ_PASSED'
  | 'QUIZ_FAILED'
  | 'ADVANCED'
  | 'LS54_PREPARED';

export type SignatureConsents = {
  read: boolean;
  agree: boolean;
  eSign: boolean;
};

export type OnboardingAuditEventDto = {
  id: string;
  stepNumber: number;
  documentKey: string;
  documentTitle: string;
  documentVersion: string;
  actionType: string;
  signerName: string | null;
  consents: SignatureConsents;
  auditHash: string;
  fileName: string | null;
  quizScore: number | null;
  quizAttempt: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  createdAt: string;
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

async function resolveApplicantId(): Promise<
  | { ok: true; candidateId: string; fingerprint: string | null }
  | { ok: false; error: string }
> {
  const cookieStore = await cookies();
  const candidateId = cookieStore.get(SESSION_COOKIE)?.value || null;
  const fingerprint = cookieStore.get(FINGERPRINT_COOKIE)?.value || null;

  if (!isUuid(candidateId)) {
    return { ok: false, error: 'No applicant session. Open your magic link or use Dev Tools.' };
  }

  // Cookie-forgery fix (readiness Blocker 0b): the session cookie alone proves
  // nothing — an attacker can set it to any candidate UUID. Always require a
  // live (candidateId, fingerprint, revokedAt IS NULL) device-session row.
  if (!fingerprint || !UUID_RE.test(fingerprint)) {
    // Dev Tools applicant impersonation has no device session; allow only
    // when dev tools are enabled (never in production builds).
    const { isDevToolsEnabled } = await import('@/lib/devToolsGate');
    if (isDevToolsEnabled()) {
      return { ok: true, candidateId, fingerprint: null };
    }
    return { ok: false, error: 'Applicant session is not active on this device. Open your magic link again.' };
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

  return { ok: true, candidateId, fingerprint };
}

async function clientMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const headerStore = await headers();
  const forwarded = headerStore.get('x-forwarded-for');
  const ipAddress =
    forwarded?.split(',')[0]?.trim() ||
    headerStore.get('x-real-ip') ||
    null;
  const userAgent = headerStore.get('user-agent');
  return { ipAddress, userAgent };
}

function makeAuditHash(parts: Record<string, string | number | boolean | null | undefined>): string {
  const payload = JSON.stringify(parts);
  return createHash('sha256').update(payload).digest('hex');
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

async function persistEvent(input: {
  candidateId: string;
  stepNumber: number;
  actionType: OnboardingActionType;
  signerName?: string | null;
  consents?: SignatureConsents;
  storagePath?: string | null;
  fileName?: string | null;
  quizScore?: number | null;
  quizAttempt?: number | null;
  quizAnswers?: Record<string, unknown> | null;
  fingerprint?: string | null;
}, database: Pick<Prisma.TransactionClient, 'onboardingSignatureEvent'> = prisma,
meta?: { ipAddress: string | null; userAgent: string | null }) {
  const doc = getOnboardingDoc(input.stepNumber);
  const { ipAddress, userAgent } = meta ?? (await clientMeta());
  const createdAt = new Date();
  const auditHash = makeAuditHash({
    candidateId: input.candidateId,
    step: input.stepNumber,
    key: doc.key,
    version: doc.version,
    action: input.actionType,
    signer: input.signerName || '',
    ts: createdAt.toISOString(),
    ip: ipAddress || '',
    fp: input.fingerprint || '',
    file: input.fileName || '',
  });

  const event = await database.onboardingSignatureEvent.create({
    data: {
      candidateId: input.candidateId,
      stepNumber: input.stepNumber,
      documentKey: doc.key,
      documentTitle: doc.title,
      documentVersion: doc.version,
      actionType: input.actionType,
      signerName: input.signerName || null,
      consents: input.consents || {},
      auditHash,
      storagePath: input.storagePath || null,
      fileName: input.fileName || null,
      quizScore: input.quizScore ?? null,
      quizAttempt: input.quizAttempt ?? null,
      quizAnswers: (input.quizAnswers as Prisma.InputJsonValue | undefined) || undefined,
      ipAddress,
      userAgent,
      deviceFingerprint: input.fingerprint || null,
      createdAt,
    },
  });

  return event;
}

export async function recordOnboardingDownload(stepNumber: number) {
  try {
    if (stepNumber < 1 || stepNumber > ONBOARDING_TOTAL_STEPS) {
      return { success: false as const, error: 'Invalid step.' };
    }
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const event = await persistEvent({
      candidateId: session.candidateId,
      stepNumber,
      actionType: 'DOWNLOADED',
      fingerprint: session.fingerprint,
    });

    return { success: true as const, data: { auditHash: event.auditHash, createdAt: event.createdAt.toISOString() } };
  } catch (error) {
    console.error('recordOnboardingDownload failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to record download.' };
  }
}

export async function recordOnboardingSignature(input: {
  stepNumber: number;
  signerName: string;
  consents: SignatureConsents;
}) {
  try {
    const stepNumber = input.stepNumber;
    if (stepNumber < 1 || stepNumber > ONBOARDING_TOTAL_STEPS) {
      return { success: false as const, error: 'Invalid step.' };
    }
    if (getOnboardingDoc(stepNumber).kind !== 'ESIGN') {
      return { success: false as const, error: 'This step cannot be completed with an e-signature.' };
    }

    const signerName = String(input.signerName || '').trim();
    if (signerName.length < 2 || signerName.length > 120) {
      return { success: false as const, error: 'Type your full legal name to sign.' };
    }
    if (!input.consents?.read || !input.consents?.agree || !input.consents?.eSign) {
      return { success: false as const, error: 'All three consent boxes are required.' };
    }

    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const event = await persistEvent({
      candidateId: session.candidateId,
      stepNumber,
      actionType: 'SIGNED',
      signerName,
      consents: input.consents,
      fingerprint: session.fingerprint,
    });

    revalidatePath('/rbt', 'layout');
    return {
      success: true as const,
      data: {
        auditHash: event.auditHash,
        createdAt: event.createdAt.toISOString(),
        ipAddress: event.ipAddress,
      },
    };
  } catch (error) {
    console.error('recordOnboardingSignature failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to record signature.' };
  }
}

export async function recordOnboardingAdvance(fromStep: number, toStep: number) {
  try {
    if (fromStep < 1 || fromStep > ONBOARDING_TOTAL_STEPS || toStep < 1 || toStep > ONBOARDING_TOTAL_STEPS) {
      return { success: false as const, error: 'Invalid step.' };
    }
    if (toStep !== fromStep + 1) {
      return { success: false as const, error: 'Onboarding steps must be advanced in order.' };
    }
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const event = await persistEvent({
      candidateId: session.candidateId,
      stepNumber: fromStep,
      actionType: 'ADVANCED',
      fingerprint: session.fingerprint,
      consents: { read: true, agree: true, eSign: true },
    });
    return { success: true as const, data: { auditHash: event.auditHash } };
  } catch (error) {
    console.error('recordOnboardingAdvance failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to record page confirmation.' };
  }
}

export async function submitOnboardingEmbeddedForm(input: {
  stepNumber: number;
  signerName: string;
  payload: EmbeddedFormPayload;
}) {
  try {
    const stepNumber = input.stepNumber;
    if (stepNumber < 1 || stepNumber > ONBOARDING_TOTAL_STEPS) {
      return { success: false as const, error: 'Invalid step.' };
    }

    const doc = getOnboardingDoc(stepNumber);
    if (doc.kind !== 'EMBEDDED' || doc.key !== input.payload.key) {
      return { success: false as const, error: 'This step is not an in-app form.' };
    }

    const signerName = String(input.signerName || '').trim();
    if (signerName.length < 2 || signerName.length > 120) {
      return { success: false as const, error: 'Type your full legal name to certify this form.' };
    }

    const validationError = validateEmbeddedForm(input.payload);
    if (validationError) {
      return { success: false as const, error: validationError };
    }

    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const normalized = normalizeForStorage(input.payload);
    const stored = protectOnboardingFormForStorage(
      session.candidateId,
      input.payload,
      normalized
    );
    const auditSummary = redactForAudit(input.payload);

    const meta = await clientMeta();
    const event = await prisma.$transaction(
      async (tx) => {
        const packet = await tx.candidateOnboardingPacket.findUnique({
          where: { candidateId: session.candidateId },
          select: { formData: true },
        });
        if (!packet) throw new Error('Candidate onboarding packet was not found');

        const prev =
          packet.formData && typeof packet.formData === 'object' && !Array.isArray(packet.formData)
            ? (packet.formData as Record<string, unknown>)
            : {};
        const embeddedForms =
          prev.embeddedForms && typeof prev.embeddedForms === 'object' && !Array.isArray(prev.embeddedForms)
            ? (prev.embeddedForms as Record<string, unknown>)
            : {};

        const updated = await tx.candidateOnboardingPacket.updateMany({
          where: { candidateId: session.candidateId },
          data: {
            formData: {
              ...prev,
              embeddedForms: {
                ...embeddedForms,
                [input.payload.key]: stored,
              },
            } as Prisma.InputJsonValue,
            ...(stepNumber === 20 ? { w4Complete: true } : {}),
            ...(stepNumber === 22 ? { directDepositComplete: true } : {}),
          },
        });
        if (updated.count !== 1) throw new Error('Candidate onboarding packet update failed');

        return persistEvent({
          candidateId: session.candidateId,
          stepNumber,
          actionType: 'FORM_SUBMITTED',
          signerName,
          fingerprint: session.fingerprint,
          consents: { read: true, agree: true, eSign: true },
          quizAnswers: auditSummary,
        }, tx, meta);
      },
      { isolationLevel: 'Serializable' }
    );

    revalidatePath('/rbt', 'layout');
    revalidatePath('/ats', 'layout');
    return {
      success: true as const,
      data: {
        auditHash: event.auditHash,
        createdAt: event.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error(
      'submitOnboardingEmbeddedForm failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to save form. Please try again.' };
  }
}

export async function uploadOnboardingFile(formData: FormData) {
  let storageClient: Awaited<ReturnType<typeof getStorageClient>> | null = null;
  let uploadedStoragePath: string | null = null;
  let databaseCommitted = false;
  try {
    const stepNumber = Number(formData.get('stepNumber'));
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > ONBOARDING_TOTAL_STEPS) {
      return { success: false as const, error: 'Invalid step.' };
    }
    const doc = getOnboardingDoc(stepNumber);
    if (doc.kind !== 'UPLOAD') {
      return { success: false as const, error: 'This step does not accept a file upload.' };
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { success: false as const, error: 'Choose a file to upload.' };
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return { success: false as const, error: 'File must be between 1 byte and 10MB.' };
    }
    const mime = normalizeMimeType(file.type);
    if (!isAllowedApplicantDocumentMime(mime)) {
      return { success: false as const, error: 'Only PDF, JPG, or PNG files are allowed.' };
    }

    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const ext = extForMime(mime);
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 120);
    const storagePath = `onboarding/${session.candidateId}/${doc.key}-${Date.now()}.${ext}`;

    const storage = await getStorageClient();
    storageClient = storage;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!applicantDocumentMagicBytesMatchMime(bytes, mime)) {
      return {
        success: false as const,
        error: 'The file content does not match its declared type.',
      };
    }
    const { error } = await storage.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      console.error('uploadOnboardingFile storage:', error.message);
      return { success: false as const, error: 'Upload failed. Try again.' };
    }
    uploadedStoragePath = storagePath;

    const packetPatch: Record<string, boolean> = {};
    if (stepNumber === 24) packetPatch.i9Complete = true;
    if (stepNumber === 27) packetPatch.cprUploaded = true;
    const meta = await clientMeta();
    const event = await prisma.$transaction(async (tx) => {
      if (Object.keys(packetPatch).length > 0) {
        const updated = await tx.candidateOnboardingPacket.updateMany({
          where: { candidateId: session.candidateId },
          data: packetPatch,
        });
        if (updated.count !== 1) throw new Error('Candidate onboarding packet update failed');
      } else {
        const packet = await tx.candidateOnboardingPacket.findUnique({
          where: { candidateId: session.candidateId },
          select: { id: true },
        });
        if (!packet) throw new Error('Candidate onboarding packet was not found');
      }

      return persistEvent({
        candidateId: session.candidateId,
        stepNumber,
        actionType: 'UPLOADED',
        storagePath,
        fileName: safeName,
        fingerprint: session.fingerprint,
        consents: { read: true, agree: true, eSign: true },
      }, tx, meta);
    });
    // The transaction now durably owns the Storage object. Catch-path cleanup
    // must only remove objects that never reached this point.
    databaseCommitted = true;

    revalidatePath('/rbt', 'layout');
    return {
      success: true as const,
      data: { auditHash: event.auditHash, fileName: safeName, createdAt: event.createdAt.toISOString() },
    };
  } catch (error) {
    if (!databaseCommitted && storageClient && uploadedStoragePath) {
      const { error: cleanupError } = await storageClient.storage
        .from(BUCKET)
        .remove([uploadedStoragePath]);
      if (cleanupError) {
        console.error('uploadOnboardingFile cleanup failed:', cleanupError.message);
      }
    }
    console.error('uploadOnboardingFile failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to upload file.' };
  }
}

export async function submitHarassmentQuiz(answers: Record<string, number>) {
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const canonicalAnswers: Record<string, number> = {};
    for (const question of HARASSMENT_QUIZ) {
      const chosen = answers[String(question.id)];
      if (!Number.isInteger(chosen) || chosen < 0 || chosen >= question.options.length) {
        return { success: false as const, error: 'Answer every quiz question before submitting.' };
      }
      canonicalAnswers[String(question.id)] = chosen;
    }

    const scored = HARASSMENT_QUIZ.map((q) => {
      return canonicalAnswers[String(q.id)] === q.correctIndex;
    });
    const correct = scored.filter(Boolean).length;
    const pct = Math.round((correct / HARASSMENT_QUIZ.length) * 100);
    const passed = pct >= HARASSMENT_QUIZ_PASS_PCT;

    const meta = await clientMeta();
    const { attempt, event } = await prisma.$transaction(
      async (tx) => {
        const prior = await tx.onboardingSignatureEvent.count({
          where: {
            candidateId: session.candidateId,
            documentKey: 'sh-training-quiz',
            actionType: { in: ['QUIZ_PASSED', 'QUIZ_FAILED'] },
          },
        });
        const attempt = prior + 1;
        const event = await persistEvent({
          candidateId: session.candidateId,
          stepNumber: 25,
          actionType: passed ? 'QUIZ_PASSED' : 'QUIZ_FAILED',
          quizScore: pct,
          quizAttempt: attempt,
          quizAnswers: canonicalAnswers,
          fingerprint: session.fingerprint,
        }, tx, meta);
        return { attempt, event };
      },
      { isolationLevel: 'Serializable' }
    );

    revalidatePath('/rbt', 'layout');
    return {
      success: true as const,
      data: {
        passed,
        score: pct,
        correct,
        total: HARASSMENT_QUIZ.length,
        attempt,
        auditHash: event.auditHash,
      },
    };
  } catch (error) {
    console.error('submitHarassmentQuiz failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to submit quiz.' };
  }
}

export async function getOnboardingStepState() {
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error, data: null };

    const [events, packet] = await Promise.all([
      prisma.onboardingSignatureEvent.findMany({
        where: {
          candidateId: session.candidateId,
          OR: [...ONBOARDING_COMPLETION_EVENT_FILTERS],
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['stepNumber'],
        select: {
          stepNumber: true,
          actionType: true,
          auditHash: true,
          createdAt: true,
        },
      }),
      prisma.candidateOnboardingPacket.findUnique({
        where: { candidateId: session.candidateId },
        select: {
          ls54Status: true,
          ls54Payload: true,
          ls54Version: true,
          ls54SentAt: true,
        },
      }),
    ]);

    return {
      success: true as const,
      data: {
        ls54Status: packet?.ls54Status || 'NONE',
        ls54Version: packet?.ls54Version ?? 0,
        ls54SentAt: packet?.ls54SentAt?.toISOString() ?? null,
        ls54Payload: packet?.ls54Payload ?? null,
        events: events.map((event) => ({
          stepNumber: event.stepNumber,
          actionType: event.actionType,
          auditHash: event.auditHash,
          createdAt: event.createdAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    console.error('getOnboardingStepState failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to load onboarding state.', data: null };
  }
}

export async function getCandidateOnboardingAudit(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);
    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate.', data: [] as OnboardingAuditEventDto[] };
    }

    const events = await prisma.onboardingSignatureEvent.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true as const, data: events.map(toDto) };
  } catch (error) {
    console.error('getCandidateOnboardingAudit failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to load audit trail.', data: [] as OnboardingAuditEventDto[] };
  }
}

/** Full audit export pack for Head HR download (JSON). */
export async function exportCandidateAuditPack(candidateId: string) {
  try {
    await requireRole(AUDIT_EXPORT_ROLES);
    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate.', data: null };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        stage: true,
        activationStatus: true,
        onboardingPacket: {
          select: {
            ls54Status: true,
            ls54Version: true,
            ls54Payload: true,
            ls54SentAt: true,
            ls54SignedAt: true,
            ls54DeclinedAt: true,
            ls54PreparedAt: true,
            tasksDone: true,
            clearedForHire: true,
            certUploaded: true,
            simulationDone: true,
            availabilityDone: true,
            interviewPassed: true,
            backgroundCleared: true,
          },
        },
      },
    });
    if (!candidate) return { success: false as const, error: 'Candidate not found.', data: null };

    const events = await prisma.onboardingSignatureEvent.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'asc' },
    });

    const exportedAt = new Date().toISOString();
    const pack = {
      exportVersion: 1,
      exportedAt,
      disclaimer:
        'Operational audit export for internal HR records. Event hashes cover action metadata (and LS-54 notice content SHA-256 when recorded on sign). This file is not a legal certification of ESIGN/ESRA compliance.',
      candidate: {
        id: candidate.id,
        name: `${candidate.firstName} ${candidate.lastName}`.trim(),
        email: candidate.email,
        stage: candidate.stage,
        activationStatus: candidate.activationStatus,
      },
      wageNotice: candidate.onboardingPacket
        ? {
            status: candidate.onboardingPacket.ls54Status,
            version: candidate.onboardingPacket.ls54Version,
            payload: candidate.onboardingPacket.ls54Payload,
            preparedAt: candidate.onboardingPacket.ls54PreparedAt?.toISOString() ?? null,
            sentAt: candidate.onboardingPacket.ls54SentAt?.toISOString() ?? null,
            signedAt: candidate.onboardingPacket.ls54SignedAt?.toISOString() ?? null,
            declinedAt: candidate.onboardingPacket.ls54DeclinedAt?.toISOString() ?? null,
            payloadSha256: createHash('sha256')
              .update(JSON.stringify(candidate.onboardingPacket.ls54Payload ?? {}))
              .digest('hex'),
          }
        : null,
      onboardingProgress: candidate.onboardingPacket
        ? {
            tasksDone: candidate.onboardingPacket.tasksDone,
            certUploaded: candidate.onboardingPacket.certUploaded,
            simulationDone: candidate.onboardingPacket.simulationDone,
            availabilityDone: candidate.onboardingPacket.availabilityDone,
            interviewPassed: candidate.onboardingPacket.interviewPassed,
            backgroundCleared: candidate.onboardingPacket.backgroundCleared,
            clearedForHire: candidate.onboardingPacket.clearedForHire,
          }
        : null,
      events: events.map(toDto),
    };

    return { success: true as const, data: pack };
  } catch (error) {
    console.error('exportCandidateAuditPack failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to export audit pack.', data: null };
  }
}

function toDto(event: {
  id: string;
  stepNumber: number;
  documentKey: string;
  documentTitle: string;
  documentVersion: string;
  actionType: string;
  signerName: string | null;
  consents: unknown;
  auditHash: string;
  fileName: string | null;
  quizScore: number | null;
  quizAttempt: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  createdAt: Date;
}): OnboardingAuditEventDto {
  const consents = (event.consents && typeof event.consents === 'object' ? event.consents : {}) as Partial<SignatureConsents>;
  return {
    id: event.id,
    stepNumber: event.stepNumber,
    documentKey: event.documentKey,
    documentTitle: event.documentTitle,
    documentVersion: event.documentVersion,
    actionType: event.actionType,
    signerName: event.signerName,
    consents: {
      read: Boolean(consents.read),
      agree: Boolean(consents.agree),
      eSign: Boolean(consents.eSign),
    },
    auditHash: event.auditHash,
    fileName: event.fileName,
    quizScore: event.quizScore,
    quizAttempt: event.quizAttempt,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    deviceFingerprint: event.deviceFingerprint,
    createdAt: event.createdAt.toISOString(),
  };
}
