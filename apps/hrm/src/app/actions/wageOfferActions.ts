'use server';

import { createHash } from 'crypto';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-guard';
import type { Prisma, Role } from '@repo/db';
import {
  LS54_DOCUMENT_KEY,
  LS54_DOCUMENT_TITLE,
  ONBOARDING_PACK_VERSION,
  type Ls54Payload,
  type Ls54Status,
} from '@/lib/onboardingDocuments';
import { canUseApplicantDeviceSession } from '@/lib/applicantAccessPolicy';

const HEAD_HR_ROLES = [
  'HEAD_HR',
  'HR',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COOKIE = 'ras_device_session_token';
const FINGERPRINT_COOKIE = 'device_fingerprint';
const SERIALIZABLE_RETRY_LIMIT = 3;

class WageNoticeRaceError extends Error {}

function isSerializableConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2034'
  );
}

async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  retryStateRaces = false
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      const retryable =
        isSerializableConflict(error) ||
        (retryStateRaces && error instanceof WageNoticeRaceError);
      if (retryable && attempt < SERIALIZABLE_RETRY_LIMIT - 1) continue;
      throw error;
    }
  }
  throw new WageNoticeRaceError('Wage notice transaction retry exhausted.');
}

export type WageOfferDto = {
  candidateId: string;
  employeeName: string;
  status: Ls54Status;
  version: number;
  payload: Ls54Payload | null;
  noticeContentSha256: string | null;
  sentAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  preparedAt: string | null;
  signatureMeta: {
    signerName: string | null;
    primaryLanguageEnglish: boolean | null;
    primaryLanguageOther: string | null;
    englishOnlyNoTemplate: boolean | null;
    noticeContentSha256: string | null;
  } | null;
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function asStatus(value: string | null | undefined): Ls54Status {
  const allowed: Ls54Status[] = ['NONE', 'DRAFT', 'SENT', 'IN_DISCUSSION', 'SIGNED', 'DECLINED'];
  if (value && allowed.includes(value as Ls54Status)) return value as Ls54Status;
  return 'NONE';
}

function parsePayload(raw: unknown): Ls54Payload | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Ls54Payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function clientMeta() {
  const headerStore = await headers();
  const forwarded = headerStore.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() || headerStore.get('x-real-ip') || null;
  const userAgent = headerStore.get('user-agent');
  return { ipAddress, userAgent };
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
  // nothing. Always require a live (candidateId, fingerprint, revokedAt IS NULL)
  // device-session row; dev-tools impersonation is the only exception (never prod).
  if (!fingerprint || !UUID_RE.test(fingerprint)) {
    const { isDevToolsEnabled } = await import('@/lib/devToolsGate');
    if (isDevToolsEnabled()) {
      return { ok: true, candidateId, fingerprint: null };
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
    session.revokedAt ||
    !canUseApplicantDeviceSession(session.candidate)
  ) {
    return { ok: false, error: 'Applicant session is not active on this device.' };
  }

  return { ok: true, candidateId, fingerprint };
}

async function writeAuditEvent(input: {
  candidateId: string;
  actionType: string;
  signerName?: string | null;
  consents?: Record<string, boolean>;
  fingerprint?: string | null;
  quizAnswers?: object | null;
  noticeVersion?: number;
  noticeContentSha256?: string | null;
}, client: Pick<Prisma.TransactionClient, 'onboardingSignatureEvent'> = prisma, meta?: {
  ipAddress: string | null;
  userAgent: string | null;
}, createdAt = new Date()) {
  const { ipAddress, userAgent } = meta ?? (await clientMeta());
  const auditHash = createHash('sha256')
    .update(
      JSON.stringify({
        candidateId: input.candidateId,
        key: LS54_DOCUMENT_KEY,
        action: input.actionType,
        signer: input.signerName || '',
        ts: createdAt.toISOString(),
        ip: ipAddress || '',
        fp: input.fingerprint || '',
        noticeVersion: input.noticeVersion ?? null,
        noticeContentSha256: input.noticeContentSha256 ?? null,
      })
    )
    .digest('hex');

  return client.onboardingSignatureEvent.create({
    data: {
      candidateId: input.candidateId,
      stepNumber: 0,
      documentKey: LS54_DOCUMENT_KEY,
      documentTitle: LS54_DOCUMENT_TITLE,
      documentVersion: ONBOARDING_PACK_VERSION,
      actionType: input.actionType,
      signerName: input.signerName || null,
      consents: input.consents || {},
      auditHash,
      quizAnswers: (input.quizAnswers as object | undefined) || undefined,
      ipAddress,
      userAgent,
      deviceFingerprint: input.fingerprint || null,
      createdAt,
    },
  });
}

function hashLs54Payload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
}

function validatePayload(payload: Ls54Payload): string | null {
  if (!payload.employerName?.trim()) return 'Employer name is required.';
  if (!payload.physicalAddress?.trim()) return 'Physical address is required.';
  if (!payload.phone?.trim()) return 'Phone is required.';
  if (!(payload.rateOfPay > 0)) return 'Hourly rate must be greater than 0.';
  if (!(payload.overtimeRate > 0)) return 'Overtime rate must be greater than 0.';
  if (payload.overtimeRate + 1e-9 < payload.rateOfPay * 1.5) {
    return 'Overtime must be at least 1.5× the regular rate.';
  }
  if (!payload.regularPayday?.trim()) return 'Regular payday is required.';
  if (payload.payFrequency === 'OTHER' && !payload.payFrequencyOther?.trim()) {
    return 'Describe the other pay frequency.';
  }
  if (!payload.allowancesNone) {
    const hasAny =
      (payload.tipsPerHour != null && payload.tipsPerHour > 0) ||
      (payload.mealsPerMeal != null && payload.mealsPerMeal > 0) ||
      Boolean(payload.lodging?.trim()) ||
      Boolean(payload.otherAllowance?.trim());
    if (!hasAny) {
      return 'Enter at least one allowance, or check “No allowances taken”.';
    }
  }
  if (!payload.preparerName?.trim()) return 'Preparer name is required.';
  if (!payload.preparerTitle?.trim()) return 'Preparer title is required.';
  if (!payload.employeeName?.trim()) return 'Employee name is required.';
  return null;
}

function toDto(
  candidateId: string,
  employeeName: string,
  packet: {
    ls54Status: string | null;
    ls54Version: number | null;
    ls54Payload: unknown;
    ls54SentAt: Date | null;
    ls54SignedAt: Date | null;
    ls54DeclinedAt: Date | null;
    ls54PreparedAt: Date | null;
  } | null,
  signatureMeta: WageOfferDto['signatureMeta'] = null
): WageOfferDto {
  return {
    candidateId,
    employeeName,
    status: asStatus(packet?.ls54Status),
    version: packet?.ls54Version ?? 0,
    payload: parsePayload(packet?.ls54Payload),
    noticeContentSha256: packet?.ls54Payload
      ? hashLs54Payload(packet.ls54Payload)
      : null,
    sentAt: packet?.ls54SentAt?.toISOString() ?? null,
    signedAt: packet?.ls54SignedAt?.toISOString() ?? null,
    declinedAt: packet?.ls54DeclinedAt?.toISOString() ?? null,
    preparedAt: packet?.ls54PreparedAt?.toISOString() ?? null,
    signatureMeta,
  };
}

async function loadSignatureMeta(candidateId: string): Promise<WageOfferDto['signatureMeta']> {
  const signed = await prisma.onboardingSignatureEvent.findFirst({
    where: { candidateId, documentKey: LS54_DOCUMENT_KEY, actionType: 'SIGNED' },
    orderBy: { createdAt: 'desc' },
    select: { signerName: true, quizAnswers: true },
  });
  if (!signed) return null;
  const qa =
    signed.quizAnswers && typeof signed.quizAnswers === 'object'
      ? (signed.quizAnswers as Record<string, unknown>)
      : {};
  return {
    signerName: signed.signerName,
    primaryLanguageEnglish:
      typeof qa.primaryLanguageEnglish === 'boolean' ? qa.primaryLanguageEnglish : null,
    primaryLanguageOther:
      typeof qa.primaryLanguageOther === 'string' ? qa.primaryLanguageOther : null,
    englishOnlyNoTemplate:
      typeof qa.englishOnlyNoTemplate === 'boolean' ? qa.englishOnlyNoTemplate : null,
    noticeContentSha256:
      typeof qa.noticeContentSha256 === 'string' ? qa.noticeContentSha256 : null,
  };
}

/** Internal loader — callers must have already authorized access to this candidate. */
async function loadWageOffer(candidateId: string) {
  try {
    if (!isUuid(candidateId)) {
      return {
        success: false as const,
        error: 'Invalid applicant id — open a real ATS applicant record.',
        data: null,
      };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      include: {
        onboardingPacket: {
          select: {
            ls54Status: true,
            ls54Version: true,
            ls54Payload: true,
            ls54SentAt: true,
            ls54SignedAt: true,
            ls54DeclinedAt: true,
            ls54PreparedAt: true,
          },
        },
      },
    });
    if (!candidate) {
      return {
        success: false as const,
        error: 'Applicant not found in ATS. No demo wage offer is shown.',
        data: null,
      };
    }

    const signatureMeta =
      asStatus(candidate.onboardingPacket?.ls54Status) === 'SIGNED'
        ? await loadSignatureMeta(candidate.id)
        : null;

    return {
      success: true as const,
      data: toDto(
        candidate.id,
        `${candidate.firstName} ${candidate.lastName}`.trim(),
        candidate.onboardingPacket,
        signatureMeta
      ),
    };
  } catch (error) {
    console.error('getWageOffer failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to load wage offer.', data: null };
  }
}

/** Staff: load any candidate's wage offer (HR leadership only). */
export async function getWageOffer(candidateId: string) {
  try {
    await requireRole(HEAD_HR_ROLES);
    return await loadWageOffer(candidateId);
  } catch (error) {
    console.error('getWageOffer failed:', error instanceof Error ? error.message : 'Unknown');
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to load wage offer.',
      data: null,
    };
  }
}

export async function getMyWageOffer() {
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error, data: null };
    return loadWageOffer(session.candidateId);
  } catch (error) {
    console.error('getMyWageOffer failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to load wage offer.', data: null };
  }
}

export async function saveWageOfferDraft(candidateId: string, payload: Ls54Payload) {
  try {
    const actor = await requireRole(HEAD_HR_ROLES);
    if (!isUuid(candidateId)) return { success: false as const, error: 'Invalid candidate.' };

    const err = validatePayload(payload);
    if (err) return { success: false as const, error: err };

    const meta = await clientMeta();
    const result = await serializableTransaction(async (tx) => {
      const candidate = await tx.atsCandidate.findUnique({
        where: { id: candidateId },
        select: {
          id: true,
          stage: true,
          onboardingPacket: {
            select: {
              id: true,
              ls54Status: true,
              ls54Version: true,
            },
          },
        },
      });
      if (!candidate) {
        return { success: false as const, error: 'Applicant not found.' };
      }
      if (candidate.stage === 'HIRED' || candidate.stage === 'REJECTED') {
        return {
          success: false as const,
          error: 'A terminal candidate cannot receive a new draft hire notice.',
        };
      }
      if (asStatus(candidate.onboardingPacket?.ls54Status) === 'SIGNED') {
        return {
          success: false as const,
          error:
            'This wage notice is already signed. A separate change-notice workflow is required.',
        };
      }

      const now = new Date();
      if (!candidate.onboardingPacket) {
        await tx.candidateOnboardingPacket.create({
          data: {
            candidateId,
            formData: {},
            ls54Payload: payload,
            ls54Status: 'DRAFT',
            ls54PreparedAt: now,
            ls54PreparedByUserId: actor.id,
          },
        });
      } else {
        const updated = await tx.candidateOnboardingPacket.updateMany({
          where: {
            id: candidate.onboardingPacket.id,
            ls54Status: candidate.onboardingPacket.ls54Status,
            ls54Version: candidate.onboardingPacket.ls54Version,
          },
          data: {
            ls54Payload: payload,
            ls54Status: 'DRAFT',
            ls54PreparedAt: now,
            ls54PreparedByUserId: actor.id,
            ls54DeclinedAt: null,
          },
        });
        if (updated.count !== 1) {
          return {
            success: false as const,
            code: 'WAGE_NOTICE_STALE' as const,
            error:
              'The wage notice changed while this draft was open. Reload before saving.',
          };
        }
      }

      await writeAuditEvent(
        {
          candidateId,
          actionType: 'LS54_PREPARED',
          signerName: `${actor.firstName} ${actor.lastName}`.trim(),
          quizAnswers: {
            versionDraft: true,
            rateOfPay: payload.rateOfPay,
          },
          noticeContentSha256: hashLs54Payload(payload),
        },
        tx,
        meta,
        now
      );
      return { success: true as const };
    });
    if (!result.success) return result;

    revalidatePath(`/ats/applicant/${candidateId}`);
    return result;
  } catch (error) {
    console.error('saveWageOfferDraft failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to save wage offer draft.' };
  }
}

export async function sendWageOffer(candidateId: string, payload: Ls54Payload) {
  try {
    const actor = await requireRole(HEAD_HR_ROLES);
    if (!isUuid(candidateId)) return { success: false as const, error: 'Invalid candidate.' };

    const err = validatePayload(payload);
    if (err) return { success: false as const, error: err };

    const meta = await clientMeta();
    const result = await serializableTransaction(async (tx) => {
      const candidate = await tx.atsCandidate.findUnique({
        where: { id: candidateId },
        select: {
          id: true,
          stage: true,
          onboardingPacket: {
            select: {
              id: true,
              ls54Version: true,
              ls54Status: true,
              ls54SentAt: true,
              ls54SignedAt: true,
            },
          },
        },
      });
      if (!candidate) {
        return { success: false as const, error: 'Applicant not found.' };
      }
      if (candidate.stage === 'HIRED' || candidate.stage === 'REJECTED') {
        return {
          success: false as const,
          error: 'A terminal candidate cannot receive a resent hire notice.',
        };
      }
      if (asStatus(candidate.onboardingPacket?.ls54Status) === 'SIGNED') {
        return {
          success: false as const,
          error:
            'This wage notice is already signed and cannot be replaced by a stale resend.',
        };
      }

      const priorVersion = candidate.onboardingPacket?.ls54Version ?? 0;
      const noticeGiven: Ls54Payload['noticeGiven'] =
        priorVersion > 0 || candidate.onboardingPacket?.ls54SentAt
          ? 'BEFORE_CHANGE'
          : payload.noticeGiven || 'AT_HIRING';
      const nextPayload: Ls54Payload = { ...payload, noticeGiven };
      const nextHash = hashLs54Payload(nextPayload);
      const now = new Date();
      const nextVersion = priorVersion + 1;

      if (!candidate.onboardingPacket) {
        await tx.candidateOnboardingPacket.create({
          data: {
            candidateId,
            formData: {},
            ls54Payload: nextPayload,
            ls54Status: 'SENT',
            ls54Version: nextVersion,
            ls54PreparedAt: now,
            ls54PreparedByUserId: actor.id,
            ls54SentAt: now,
          },
        });
      } else {
        const updated = await tx.candidateOnboardingPacket.updateMany({
          where: {
            id: candidate.onboardingPacket.id,
            ls54Status: candidate.onboardingPacket.ls54Status,
            ls54Version: priorVersion,
            ls54SignedAt: candidate.onboardingPacket.ls54SignedAt,
          },
          data: {
            ls54Payload: nextPayload,
            ls54Status: 'SENT',
            ls54Version: nextVersion,
            ls54PreparedAt: now,
            ls54PreparedByUserId: actor.id,
            ls54SentAt: now,
            ls54DeclinedAt: null,
            ls54SignedAt: null,
          },
        });
        if (updated.count !== 1) {
          return {
            success: false as const,
            code: 'WAGE_NOTICE_STALE' as const,
            error:
              'The wage notice was signed or changed while this resend was open. Reload before continuing.',
          };
        }
      }

      if (candidate.stage !== 'OFFER') {
        const staged = await tx.atsCandidate.updateMany({
          where: { id: candidateId, stage: candidate.stage },
          data: { stage: 'OFFER' },
        });
        if (staged.count !== 1) {
          throw new WageNoticeRaceError(
            'Candidate stage changed during wage notice resend.'
          );
        }
      }

      await writeAuditEvent(
        {
          candidateId,
          actionType: 'LS54_SENT',
          signerName: `${actor.firstName} ${actor.lastName}`.trim(),
          quizAnswers: {
            version: nextVersion,
            rateOfPay: nextPayload.rateOfPay,
            overtimeRate: nextPayload.overtimeRate,
            regularPayday: nextPayload.regularPayday,
            noticeContentSha256: nextHash,
          },
          noticeVersion: nextVersion,
          noticeContentSha256: nextHash,
        },
        tx,
        meta,
        now
      );

      return {
        success: true as const,
        data: {
          version: nextVersion,
          noticeContentSha256: nextHash,
        },
      };
    });
    if (!result.success) return result;

    revalidatePath(`/ats/applicant/${candidateId}`);
    revalidatePath('/ats');
    revalidatePath('/rbt', 'layout');
    return result;
  } catch (error) {
    if (error instanceof WageNoticeRaceError || isSerializableConflict(error)) {
      return {
        success: false as const,
        code: 'WAGE_NOTICE_STALE' as const,
        error:
          'Candidate or wage notice state changed before resend completed. Reload before retrying.',
      };
    }
    console.error('sendWageOffer failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to send wage offer.' };
  }
}

export async function signWageOffer(input: {
  signerName: string;
  primaryLanguageEnglish: boolean;
  primaryLanguageOther?: string;
  /** Employee affirms English-only notice because DOL has no template in their language */
  englishOnlyNoTemplate?: boolean;
  /** Expected-current values from the exact notice rendered to the applicant. */
  noticeVersion: number;
  noticeContentSha256: string;
  consents: { read: boolean; agree: boolean; eSign: boolean; ackNotice: boolean };
}) {
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };
    if (!session.fingerprint) {
      return {
        success: false as const,
        error:
          'A fingerprint-bound applicant session is required to sign this notice.',
      };
    }

    const signerName = String(input.signerName || '').trim();
    if (signerName.length < 2) return { success: false as const, error: 'Type your full legal name.' };
    if (
      !input.consents?.read ||
      !input.consents?.agree ||
      !input.consents?.eSign ||
      !input.consents?.ackNotice
    ) {
      return { success: false as const, error: 'All acknowledgment boxes are required.' };
    }
    if (!input.primaryLanguageEnglish) {
      if (!String(input.primaryLanguageOther || '').trim()) {
        return { success: false as const, error: 'Enter your primary language.' };
      }
      if (!input.englishOnlyNoTemplate) {
        return {
          success: false as const,
          error:
            'Confirm you received this notice in English only because DOL does not offer your language yet.',
        };
      }
    }

    if (
      !Number.isInteger(input.noticeVersion) ||
      input.noticeVersion < 1 ||
      !/^[0-9a-f]{64}$/i.test(input.noticeContentSha256)
    ) {
      return {
        success: false as const,
        code: 'WAGE_NOTICE_STALE' as const,
        error: 'The displayed wage notice is stale. Reload it before signing.',
      };
    }

    const meta = await clientMeta();
    const result = await serializableTransaction(
      async (tx) => {
        const liveSession = await tx.applicantDeviceSession.findUnique({
          where: {
            candidateId_deviceFingerprint: {
              candidateId: session.candidateId,
              deviceFingerprint: session.fingerprint!,
            },
          },
          select: {
            revokedAt: true,
            candidate: {
              select: {
                id: true,
                stage: true,
                activationStatus: true,
              },
            },
          },
        });
        if (
          !liveSession ||
          liveSession.revokedAt ||
          !canUseApplicantDeviceSession(liveSession.candidate)
        ) {
          return {
            success: false as const,
            error: 'Applicant session is no longer active on this device.',
          };
        }

        const packet = await tx.candidateOnboardingPacket.findUnique({
          where: { candidateId: session.candidateId },
          select: {
            id: true,
            ls54Status: true,
            ls54Version: true,
            ls54Payload: true,
            ls54SignedAt: true,
          },
        });
        if (!packet) {
          return {
            success: false as const,
            error: 'No wage notice is waiting for your signature.',
          };
        }

        const payloadHash = hashLs54Payload(packet.ls54Payload);
        if (
          packet.ls54Version !== input.noticeVersion ||
          payloadHash !== input.noticeContentSha256.toLowerCase()
        ) {
          return {
            success: false as const,
            code: 'WAGE_NOTICE_STALE' as const,
            error:
              'The wage notice changed after it was displayed. Reload and review the current version before signing.',
          };
        }

        const durableResult = (auditHash: string) => ({
          success: true as const,
          data: {
            auditHash,
            hired: liveSession.candidate.stage === 'HIRED',
            requiresStaffFinalHire:
              liveSession.candidate.stage !== 'HIRED',
            version: packet.ls54Version,
            noticeContentSha256: payloadHash,
          },
        });

        if (packet.ls54Status === 'SIGNED') {
          const existingEvent =
            await tx.onboardingSignatureEvent.findFirst({
              where: {
                candidateId: session.candidateId,
                documentKey: LS54_DOCUMENT_KEY,
                actionType: 'SIGNED',
              },
              orderBy: { createdAt: 'desc' },
              select: {
                auditHash: true,
                quizAnswers: true,
                deviceFingerprint: true,
              },
            });
          const answers = asRecord(existingEvent?.quizAnswers);
          if (
            existingEvent &&
            existingEvent.deviceFingerprint === session.fingerprint &&
            answers.version === packet.ls54Version &&
            answers.noticeContentSha256 === payloadHash
          ) {
            return durableResult(existingEvent.auditHash);
          }
          return {
            success: false as const,
            code: 'WAGE_NOTICE_STALE' as const,
            error:
              'This notice is signed, but its current signature evidence does not match this device and version. Contact Head HR.',
          };
        }

        if (!['SENT', 'IN_DISCUSSION'].includes(packet.ls54Status)) {
          return {
            success: false as const,
            error: 'No wage notice is waiting for your signature.',
          };
        }
        if (
          liveSession.candidate.stage !== 'OFFER' &&
          liveSession.candidate.stage !== 'HELP_DESK'
        ) {
          return {
            success: false as const,
            code: 'WAGE_NOTICE_STALE' as const,
            error:
              'Candidate state changed before signing. Contact Head HR for the current offer.',
          };
        }

        const now = new Date();
        const signed = await tx.candidateOnboardingPacket.updateMany({
          where: {
            id: packet.id,
            ls54Status: { in: ['SENT', 'IN_DISCUSSION'] },
            ls54Version: packet.ls54Version,
            ls54SignedAt: null,
          },
          data: {
            ls54Status: 'SIGNED',
            ls54SignedAt: now,
            ls54DeclinedAt: null,
          },
        });
        if (signed.count !== 1) {
          throw new WageNoticeRaceError(
            'Wage notice state changed during signature.'
          );
        }

        const event = await writeAuditEvent(
          {
            candidateId: session.candidateId,
            actionType: 'SIGNED',
            signerName,
            consents: input.consents,
            fingerprint: session.fingerprint,
            quizAnswers: {
              primaryLanguageEnglish: input.primaryLanguageEnglish,
              primaryLanguageOther: input.primaryLanguageOther || null,
              englishOnlyNoTemplate: Boolean(
                input.englishOnlyNoTemplate
              ),
              version: packet.ls54Version,
              noticeContentSha256: payloadHash,
            },
            noticeVersion: packet.ls54Version,
            noticeContentSha256: payloadHash,
          },
          tx,
          meta,
          now
        );

        if (liveSession.candidate.stage === 'HELP_DESK') {
          const restored = await tx.atsCandidate.updateMany({
            where: {
              id: session.candidateId,
              stage: 'HELP_DESK',
            },
            data: { stage: 'OFFER' },
          });
          if (restored.count !== 1) {
            throw new WageNoticeRaceError(
              'Candidate stage changed during signature.'
            );
          }
        }

        return durableResult(event.auditHash);
      },
      true
    );
    if (!result.success) return result;

    revalidatePath('/rbt', 'layout');
    revalidatePath('/ats');
    return result;
  } catch (error) {
    console.error('signWageOffer failed:', error instanceof Error ? error.message : 'Unknown');
    if (error instanceof WageNoticeRaceError || isSerializableConflict(error)) {
      return {
        success: false as const,
        code: 'WAGE_NOTICE_STALE' as const,
        error:
          'The wage notice changed while it was being signed. Reload to view the durable outcome.',
      };
    }
    return { success: false as const, error: 'Failed to sign wage notice.' };
  }
}

export async function declineWageOffer(reason?: string) {
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const packet = await prisma.candidateOnboardingPacket.findUnique({
      where: { candidateId: session.candidateId },
    });
    if (!packet || !['SENT', 'IN_DISCUSSION'].includes(packet.ls54Status)) {
      return { success: false as const, error: 'No wage offer to decline.' };
    }

    const now = new Date();
    await prisma.candidateOnboardingPacket.update({
      where: { candidateId: session.candidateId },
      data: {
        ls54Status: 'DECLINED',
        ls54DeclinedAt: now,
      },
    });

    await writeAuditEvent({
      candidateId: session.candidateId,
      actionType: 'LS54_DECLINED',
      fingerprint: session.fingerprint,
      quizAnswers: { reason: String(reason || '').slice(0, 500), version: packet.ls54Version },
    });

    revalidatePath('/rbt', 'layout');
    revalidatePath('/ats');
    return { success: true as const };
  } catch (error) {
    console.error('declineWageOffer failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to decline wage offer.' };
  }
}

export async function discussWageOffer(message?: string) {
  try {
    const session = await resolveApplicantId();
    if (!session.ok) return { success: false as const, error: session.error };

    const packet = await prisma.candidateOnboardingPacket.findUnique({
      where: { candidateId: session.candidateId },
    });
    if (!packet || !['SENT', 'IN_DISCUSSION', 'DECLINED'].includes(packet.ls54Status)) {
      return { success: false as const, error: 'No wage offer available to discuss.' };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: session.candidateId },
      select: { firstName: true, lastName: true },
    });
    const senderName = candidate
      ? `${candidate.firstName} ${candidate.lastName}`.trim()
      : 'Applicant';
    const bodyText =
      message?.trim() ||
      'I would like to discuss the wage notice / hourly rate with Head HR before signing.';

    // Route to the Head HR who prepared/sent this LS-54 — not the unclaimed queue.
    let assigneeId: string | null = null;
    let assigneeName: string | null = null;
    if (isUuid(packet.ls54PreparedByUserId)) {
      const preparer = await prisma.user.findUnique({
        where: { id: packet.ls54PreparedByUserId },
        select: { id: true, firstName: true, lastName: true, isActive: true },
      });
      if (preparer && preparer.isActive !== false) {
        assigneeId = preparer.id;
        assigneeName = `${preparer.firstName} ${preparer.lastName}`.trim();
      }
    }

    const existingWageTicket = await prisma.atsHelpTicket.findFirst({
      where: {
        candidateId: session.candidateId,
        subject: { startsWith: '[WAGE_OFFER]' },
        status: { in: ['OPEN', 'CLAIMED', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    let ticketId: string;

    if (existingWageTicket) {
      const updated = await prisma.atsHelpTicket.update({
        where: { id: existingWageTicket.id },
        data: {
          status: assigneeId ? 'CLAIMED' : existingWageTicket.status === 'OPEN' ? 'OPEN' : existingWageTicket.status,
          claimedByUserId: assigneeId ?? existingWageTicket.claimedByUserId,
          priority: 'HIGH',
          messages: {
            create: {
              senderType: 'CANDIDATE',
              body: JSON.stringify({
                text: bodyText,
                type: 'TEXT',
                senderName,
                category: 'WAGE_OFFER',
              }),
            },
          },
        },
      });
      ticketId = updated.id;

      if (assigneeId && existingWageTicket.claimedByUserId !== assigneeId) {
        await prisma.atsHelpMessage.create({
          data: {
            ticketId,
            senderType: 'SYSTEM',
            senderUserId: assigneeId,
            body: JSON.stringify({
              text: `Auto-assigned to ${assigneeName || 'the Head HR who sent this wage notice'} (LS-54 preparer).`,
              type: 'TEXT',
              senderName: 'System',
              category: 'WAGE_OFFER',
            }),
          },
        });
      }
    } else {
      const ticket = await prisma.atsHelpTicket.create({
        data: {
          candidateId: session.candidateId,
          subject: '[WAGE_OFFER] Wage offer discussion (LS-54)',
          status: assigneeId ? 'CLAIMED' : 'OPEN',
          claimedByUserId: assigneeId,
          priority: 'HIGH',
          messages: {
            create: [
              {
                senderType: 'CANDIDATE',
                body: JSON.stringify({
                  text: bodyText,
                  type: 'TEXT',
                  senderName,
                  category: 'WAGE_OFFER',
                }),
              },
              ...(assigneeId
                ? [
                    {
                      senderType: 'SYSTEM' as const,
                      senderUserId: assigneeId,
                      body: JSON.stringify({
                        text: `Auto-assigned to ${assigneeName || 'the Head HR who sent this wage notice'} (LS-54 preparer).`,
                        type: 'TEXT',
                        senderName: 'System',
                        category: 'WAGE_OFFER',
                      }),
                    },
                  ]
                : []),
            ],
          },
        },
      });
      ticketId = ticket.id;
    }

    await prisma.atsCandidate.update({
      where: { id: session.candidateId },
      data: { stage: 'HELP_DESK' },
    });

    await prisma.candidateOnboardingPacket.update({
      where: { candidateId: session.candidateId },
      data: { ls54Status: 'IN_DISCUSSION' },
    });

    await writeAuditEvent({
      candidateId: session.candidateId,
      actionType: 'LS54_DISCUSSION',
      fingerprint: session.fingerprint,
      quizAnswers: {
        ticketId,
        version: packet.ls54Version,
        assignedToUserId: assigneeId,
      },
    });

    revalidatePath('/rbt', 'layout');
    revalidatePath('/ats');
    revalidatePath('/ats/help-tickets');
    revalidatePath('/rbt/help-desk');
    return {
      success: true as const,
      data: { ticketId, assignedToUserId: assigneeId },
    };
  } catch (error) {
    console.error('discussWageOffer failed:', error instanceof Error ? error.message : 'Unknown');
    return { success: false as const, error: 'Failed to open wage discussion.' };
  }
}

