import 'server-only';

import { createHash } from 'node:crypto';
import type { Prisma } from '@repo/db';
import { prisma } from '@/lib/prisma';
import {
  LS54_DOCUMENT_KEY,
  ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboardingDocuments';
import { validateAvailabilitySubmission } from '@/app/(dashboard)/rbt/availability/availabilityModel';
import { notifyUsers } from '@/app/actions/notifications';

const COMPLETION_AUDIT_ACTIONS = new Set([
  'SIGNED',
  'FORM_SUBMITTED',
  'UPLOADED',
  'QUIZ_PASSED',
]);
const TERMINAL_STAGES = new Set(['HIRED', 'REJECTED']);
const SERIALIZABLE_RETRY_LIMIT = 3;

export type HireReadinessBlockerCode =
  | 'CANDIDATE_TERMINAL'
  | 'STAGE_NOT_OFFER'
  | 'LS54_NOT_SIGNED'
  | 'LS54_SIGNATURE_STALE'
  | 'ONBOARDING_TASKS_INCOMPLETE'
  | 'AVAILABILITY_INCOMPLETE'
  | 'INTERVIEW_NOT_APPROVED'
  | 'CERTIFICATE_EVIDENCE_MISSING'
  | 'CERTIFICATE_REVIEW_REQUIRED'
  | 'BACKGROUND_CLEARANCE_REQUIRED';

export type HireReadinessBlocker = {
  code: HireReadinessBlockerCode;
  message: string;
};

export type HireReadinessEvidence = {
  stage: string;
  activationStatus: string;
  bacbVerified: boolean;
  onboardingPacket: {
    ls54Status: string;
    ls54Version: number;
    ls54Payload: unknown;
    ls54SignedAt: Date | null;
    formData: unknown;
    availabilityGrid: unknown;
    preferredBoroughs: unknown;
    transportation: string | null;
    maxTravelMiles: number | null;
    backgroundCleared: boolean;
  } | null;
  interview: {
    status: string;
    recommendation: string | null;
    completedAt: Date | null;
  } | null;
  signatureEvents: Array<{
    stepNumber: number;
    documentKey: string;
    actionType: string;
    auditHash: string;
    quizAnswers: unknown;
    deviceFingerprint: string | null;
    createdAt: Date;
  }>;
};

export type HireReadinessResult = {
  ready: boolean;
  blockers: HireReadinessBlocker[];
  evidence: {
    ls54Version: number | null;
    ls54ContentSha256: string | null;
    certificateStoragePath: string | null;
    completedOnboardingSteps: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hashNoticePayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(payload ?? {}))
    .digest('hex');
}

function addBlocker(
  blockers: HireReadinessBlocker[],
  code: HireReadinessBlockerCode,
  message: string
) {
  blockers.push({ code, message });
}

/**
 * Pure evaluator. The implementation is intentionally side-effect free so
 * every hiring entry point can share one authoritative readiness decision.
 */
export function evaluateHireReadiness(
  candidate: HireReadinessEvidence
): HireReadinessResult {
  const blockers: HireReadinessBlocker[] = [];
  const packet = candidate.onboardingPacket;
  const coach = asRecord(asRecord(packet?.formData).fortyHourCoach);
  const certificateStoragePath =
    coach.step === 'UPLOADED' &&
    typeof coach.uploadedAt === 'string' &&
    coach.uploadedAt.length > 0 &&
    typeof coach.certStoragePath === 'string' &&
    coach.certStoragePath.length > 0
      ? coach.certStoragePath
      : null;

  const completedSteps = new Set(
    candidate.signatureEvents
      .filter(
        (event) =>
          event.stepNumber >= 1 &&
          event.stepNumber <= ONBOARDING_TOTAL_STEPS &&
          Number.isInteger(event.stepNumber) &&
          COMPLETION_AUDIT_ACTIONS.has(event.actionType)
      )
      .map((event) => event.stepNumber)
  );

  const ls54StatusIsSigned =
    packet?.ls54Status === 'SIGNED' &&
    packet.ls54SignedAt instanceof Date &&
    packet.ls54Version > 0 &&
    packet.ls54Payload !== null &&
    packet.ls54Payload !== undefined;
  const ls54ContentSha256 = ls54StatusIsSigned
    ? hashNoticePayload(packet.ls54Payload)
    : null;
  const hasCurrentSignedEvent =
    ls54StatusIsSigned &&
    candidate.signatureEvents.some((event) => {
      if (
        event.documentKey !== LS54_DOCUMENT_KEY ||
        event.actionType !== 'SIGNED' ||
        !event.auditHash ||
        !event.deviceFingerprint
      ) {
        return false;
      }
      const answers = asRecord(event.quizAnswers);
      return (
        answers.version === packet.ls54Version &&
        answers.noticeContentSha256 === ls54ContentSha256
      );
    });

  if (
    TERMINAL_STAGES.has(candidate.stage) ||
    candidate.activationStatus === 'REJECTED'
  ) {
    addBlocker(
      blockers,
      'CANDIDATE_TERMINAL',
      'A terminal candidate cannot enter a new hiring transition.'
    );
  }
  if (!TERMINAL_STAGES.has(candidate.stage) && candidate.stage !== 'OFFER') {
    addBlocker(
      blockers,
      'STAGE_NOT_OFFER',
      'Candidate must be in the current OFFER stage for final hire.'
    );
  }
  if (!ls54StatusIsSigned) {
    addBlocker(
      blockers,
      'LS54_NOT_SIGNED',
      'The current LS-54 notice must be signed before final hire.'
    );
  } else if (!hasCurrentSignedEvent) {
    addBlocker(
      blockers,
      'LS54_SIGNATURE_STALE',
      'The signed LS-54 event does not match the current immutable notice version and content.'
    );
  }
  if (completedSteps.size !== ONBOARDING_TOTAL_STEPS) {
    addBlocker(
      blockers,
      'ONBOARDING_TASKS_INCOMPLETE',
      'Durable completion events are missing for one or more onboarding steps.'
    );
  }

  const availability = validateAvailabilitySubmission({
    availability: packet?.availabilityGrid,
    preferredBoroughs: packet?.preferredBoroughs,
    transportation: packet?.transportation,
    maxTravelMiles: packet?.maxTravelMiles,
  });
  if (!availability.ok) {
    addBlocker(
      blockers,
      'AVAILABILITY_INCOMPLETE',
      'A complete, validated availability record is required before final hire.'
    );
  }

  if (
    candidate.interview?.status !== 'COMPLETED' ||
    candidate.interview.recommendation !== 'ADVANCE' ||
    !(candidate.interview.completedAt instanceof Date)
  ) {
    addBlocker(
      blockers,
      'INTERVIEW_NOT_APPROVED',
      'The durable interview record must be completed with an ADVANCE recommendation.'
    );
  }
  if (!certificateStoragePath) {
    addBlocker(
      blockers,
      'CERTIFICATE_EVIDENCE_MISSING',
      'Durable 40-hour certificate upload evidence is required before final hire.'
    );
  } else if (!candidate.bacbVerified) {
    addBlocker(
      blockers,
      'CERTIFICATE_REVIEW_REQUIRED',
      'The certificate is uploaded, but staff verification is not recorded. Verify the credential before final hire.'
    );
  }
  if (packet?.backgroundCleared !== true) {
    addBlocker(
      blockers,
      'BACKGROUND_CLEARANCE_REQUIRED',
      'Staff background clearance must be recorded before final hire.'
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
    evidence: {
      ls54Version: packet?.ls54Version ?? null,
      ls54ContentSha256,
      certificateStoragePath,
      completedOnboardingSteps: completedSteps.size,
    },
  };
}

export type HireCandidateDomainResult =
  | {
      success: true;
      candidateId: string;
      userId: string;
      alreadyHired: boolean;
      supabaseAuthProvisioned: false;
      accessMode: 'CANDIDATE_DEVICE_SESSION';
    }
  | {
      success: false;
      error: string;
      code?: string;
      blockers?: HireReadinessBlocker[];
    };

type HireTransactionCandidate = HireReadinessEvidence & {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  appliedRole: string;
  userId: string | null;
};

type HireDomainInput = {
  candidateId: string;
  actorUserId: string;
  actorRole: string;
  notificationLinkUrl?: string;
};

class HireTransactionAbort extends Error {}
class HireStateRaceError extends Error {}

function isRetryableDatabaseConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}

function successfulOutcome(
  candidateId: string,
  userId: string,
  alreadyHired: boolean
): HireCandidateDomainResult {
  return {
    success: true,
    candidateId,
    userId,
    alreadyHired,
    supabaseAuthProvisioned: false,
    accessMode: 'CANDIDATE_DEVICE_SESSION',
  };
}

async function loadHireCandidate(
  tx: Prisma.TransactionClient,
  candidateId: string
): Promise<HireTransactionCandidate | null> {
  return tx.atsCandidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      appliedRole: true,
      stage: true,
      activationStatus: true,
      bacbVerified: true,
      userId: true,
      onboardingPacket: {
        select: {
          ls54Status: true,
          ls54Version: true,
          ls54Payload: true,
          ls54SignedAt: true,
          formData: true,
          availabilityGrid: true,
          preferredBoroughs: true,
          transportation: true,
          maxTravelMiles: true,
          backgroundCleared: true,
        },
      },
      interview: {
        select: {
          status: true,
          recommendation: true,
          completedAt: true,
        },
      },
      signatureEvents: {
        where: {
          OR: [
            {
              stepNumber: { gte: 1, lte: ONBOARDING_TOTAL_STEPS },
              actionType: { in: [...COMPLETION_AUDIT_ACTIONS] },
            },
            {
              documentKey: LS54_DOCUMENT_KEY,
              actionType: 'SIGNED',
            },
          ],
        },
        select: {
          stepNumber: true,
          documentKey: true,
          actionType: true,
          auditHash: true,
          quizAnswers: true,
          deviceFingerprint: true,
          createdAt: true,
        },
      },
    },
  });
}

async function resolveRbtHiredRecipients(
  tx: Prisma.TransactionClient
): Promise<string[]> {
  const staffingClients = await tx.client.findMany({
    where: { status: 'STAFFING_PENDING' },
    select: { bcbaId: true, caseCoordinatorId: true },
  });

  const ids = new Set<string>();
  for (const client of staffingClients) {
    if (client.bcbaId) ids.add(client.bcbaId);
    if (client.caseCoordinatorId) ids.add(client.caseCoordinatorId);
  }

  if (ids.size === 0) {
    const bcbas = await tx.user.findMany({
      where: { role: 'BCBA', isActive: true },
      select: { id: true },
    });
    bcbas.forEach((user) => ids.add(user.id));
  }

  if (ids.size === 0) {
    const hrLeads = await tx.user.findMany({
      where: { role: { in: ['HEAD_HR', 'HR'] }, isActive: true },
      select: { id: true },
    });
    hrLeads.forEach((user) => ids.add(user.id));
  }

  return [...ids];
}

async function performHireTransaction(
  tx: Prisma.TransactionClient,
  input: HireDomainInput
): Promise<HireCandidateDomainResult> {
  const candidate = await loadHireCandidate(tx, input.candidateId);
  if (!candidate) {
    return {
      success: false,
      code: 'CANDIDATE_NOT_FOUND',
      error: 'Candidate not found.',
    };
  }

  if (candidate.stage === 'HIRED') {
    if (!candidate.userId) {
      return {
        success: false,
        code: 'HIRED_PROFILE_INCONSISTENT',
        error: 'Candidate is marked hired but has no linked internal profile.',
      };
    }
    const linkedUser = await tx.user.findUnique({
      where: { id: candidate.userId },
      select: { id: true, email: true, isActive: true },
    });
    if (!linkedUser) {
      return {
        success: false,
        code: 'HIRED_PROFILE_INCONSISTENT',
        error: 'Candidate is marked hired but the linked internal profile is missing.',
      };
    }
    return successfulOutcome(candidate.id, linkedUser.id, true);
  }

  const readiness = evaluateHireReadiness(candidate);
  if (!readiness.ready) {
    return {
      success: false,
      code: 'HIRE_READINESS_BLOCKED',
      error:
        readiness.blockers[0]?.message ??
        'Candidate is not ready for final hire.',
      blockers: readiness.blockers,
    };
  }

  const email = candidate.email.toLowerCase().trim();
  const role = candidate.appliedRole === 'BCBA' ? 'BCBA' : 'RBT';
  const existingUser = await tx.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });

  let userId: string;
  if (!existingUser) {
    if (candidate.userId) {
      throw new HireTransactionAbort(
        'Candidate has a stale profile link that does not match the hiring email.'
      );
    }
    const created = await tx.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        role,
        isActive: true,
      },
      select: { id: true },
    });
    userId = created.id;
  } else {
    if (existingUser.isActive && candidate.userId !== existingUser.id) {
      return {
        success: false,
        code: 'ACTIVE_EMAIL_COLLISION',
        error:
          'Email already belongs to an active staff profile. Resolve the identity collision before hiring.',
      };
    }

    userId = existingUser.id;
    if (!existingUser.isActive) {
      const reactivated = await tx.user.updateMany({
        where: { id: existingUser.id, isActive: false },
        data: {
          isActive: true,
          role,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
        },
      });
      if (reactivated.count !== 1) {
        throw new HireStateRaceError(
          'The existing staff profile changed during final hire.'
        );
      }
    }
  }

  const transitioned = await tx.atsCandidate.updateMany({
    where: {
      id: candidate.id,
      stage: 'OFFER',
      userId: candidate.userId,
    },
    data: {
      userId,
      stage: 'HIRED',
      activationStatus: 'ACTIVE',
    },
  });
  if (transitioned.count !== 1) {
    throw new HireStateRaceError(
      'Candidate state changed during final hire.'
    );
  }

  const packetTransition =
    await tx.candidateOnboardingPacket.updateMany({
      where: {
        candidateId: candidate.id,
        ls54Status: 'SIGNED',
        ls54Version: readiness.evidence.ls54Version!,
        ls54SignedAt: candidate.onboardingPacket!.ls54SignedAt!,
      },
      data: { magicLinkRevokedAt: new Date() },
    });
  if (packetTransition.count !== 1) {
    throw new HireStateRaceError(
      'The signed wage notice changed during final hire.'
    );
  }

  // Existing fingerprint-bound device sessions intentionally remain live and
  // transition to RBT portal semantics through the committed HIRED stage.
  // Revoking the packet link above prevents fresh device binding. This does
  // not provision a Supabase Auth/password credential.
  await tx.auditLogVault.create({
    data: {
      userId: input.actorUserId,
      action: 'HIRE',
      resourceType: 'ATS_CANDIDATE',
      resourceId: candidate.id,
      metadata: {
        actorRole: input.actorRole,
        linkedUserId: userId,
        internalProfileActive: true,
        supabaseAuthProvisioned: false,
        accessMode: 'CANDIDATE_DEVICE_SESSION',
        magicLinkRebindingRevoked: true,
        ls54Version: readiness.evidence.ls54Version,
        ls54ContentSha256: readiness.evidence.ls54ContentSha256,
        certificateEvidencePresent: Boolean(
          readiness.evidence.certificateStoragePath
        ),
        certificateStaffVerified: candidate.bacbVerified,
        completedOnboardingSteps:
          readiness.evidence.completedOnboardingSteps,
      },
    },
  });

  const recipients = await resolveRbtHiredRecipients(tx);
  const notificationResult = await notifyUsers(
    {
      userIds: recipients,
      title: 'RBT hiring transition completed',
      message:
        'An RBT profile completed staff final-hire review. Supabase Auth credentials are not provisioned by this transition.',
      type: 'RBT_HIRED',
      linkUrl: input.notificationLinkUrl ?? '/rbt-manager',
    },
    tx
  );
  if (!notificationResult.success) {
    throw new HireTransactionAbort(
      'The internal hire notification could not be enqueued.'
    );
  }

  return successfulOutcome(candidate.id, userId, false);
}

/**
 * The only domain service permitted to write AtsCandidate.stage = HIRED.
 * Exported Server Actions authenticate independently, then call this service
 * with server-derived actor identity. No serializable gate bypass is accepted.
 */
export async function hireCandidateDomain(
  input: HireDomainInput
): Promise<HireCandidateDomainResult> {
  for (let attempt = 0; attempt < SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => performHireTransaction(tx, input),
        { isolationLevel: 'Serializable' }
      );
    } catch (error) {
      if (
        (isRetryableDatabaseConflict(error) ||
          error instanceof HireStateRaceError) &&
        attempt < SERIALIZABLE_RETRY_LIMIT - 1
      ) {
        continue;
      }
      console.error(
        'hireCandidateDomain failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return {
        success: false,
        code: 'HIRE_TRANSACTION_FAILED',
        error:
          'Final hire could not be committed atomically. No partial hire was retained.',
      };
    }
  }

  return {
    success: false,
    code: 'HIRE_TRANSACTION_FAILED',
    error:
      'Final hire could not be committed atomically. No partial hire was retained.',
  };
}
