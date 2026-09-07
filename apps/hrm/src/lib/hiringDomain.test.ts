import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HireReadinessEvidence } from './hiringDomain';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const FINGERPRINT = '44444444-4444-4444-8444-444444444444';
const ONBOARDING_TOTAL_STEPS = 27;
const SIGNED_AT = new Date('2026-08-12T15:00:00.000Z');
const LS54_PAYLOAD = {
  employeeName: 'Ready Candidate',
  rateOfPay: 25,
  overtimeRate: 37.5,
  regularPayday: 'Friday',
};
const LS54_HASH = createHash('sha256')
  .update(JSON.stringify(LS54_PAYLOAD))
  .digest('hex');

const mocks = vi.hoisted(() => {
  const tx = {
    atsCandidate: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
    },
    candidateOnboardingPacket: {
      updateMany: vi.fn(),
    },
    applicantDeviceSession: {
      updateMany: vi.fn(),
    },
    auditLogVault: {
      create: vi.fn(),
    },
  };
  return {
    tx,
    notifyUsers: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/app/actions/notifications', () => ({
  notifyUsers: mocks.notifyUsers,
}));

import {
  evaluateHireReadiness,
  hireCandidateDomain,
} from './hiringDomain';

function validEvidence(): HireReadinessEvidence {
  return {
    stage: 'OFFER',
    activationStatus: 'ACTIVE',
    bacbVerified: true,
    onboardingPacket: {
      ls54Status: 'SIGNED',
      ls54Version: 3,
      ls54Payload: LS54_PAYLOAD,
      ls54SignedAt: SIGNED_AT,
      formData: {
        fortyHourCoach: {
          step: 'UPLOADED',
          uploadedAt: '2026-08-11T14:00:00.000Z',
          certStoragePath: `${CANDIDATE_ID}/40hr-cert.pdf`,
        },
      },
      availabilityGrid: {
        version: 1,
        timeZone: 'America/New_York',
        slotMinutes: 60,
        windows: [
          { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
        ],
      },
      preferredBoroughs: ['Brooklyn'],
      transportation: 'PUBLIC_TRANSIT',
      maxTravelMiles: 15,
      backgroundCleared: true,
    },
    interview: {
      status: 'COMPLETED',
      recommendation: 'ADVANCE',
      completedAt: new Date('2026-08-10T16:00:00.000Z'),
    },
    signatureEvents: [
      ...Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, index) => ({
        stepNumber: index + 1,
        documentKey: `onboarding-step-${index + 1}`,
        actionType: 'SIGNED',
        auditHash: `task-audit-${index + 1}`,
        quizAnswers: null,
        deviceFingerprint: FINGERPRINT,
        createdAt: new Date('2026-08-09T16:00:00.000Z'),
      })),
      {
        stepNumber: 0,
        documentKey: 'ls-54',
        actionType: 'SIGNED',
        auditHash: 'signed-ls54-audit',
        quizAnswers: {
          version: 3,
          noticeContentSha256: LS54_HASH,
        },
        deviceFingerprint: FINGERPRINT,
        createdAt: SIGNED_AT,
      },
    ],
  };
}

function transactionCandidate(stage = 'OFFER') {
  return {
    id: CANDIDATE_ID,
    firstName: 'Ready',
    lastName: 'Candidate',
    email: 'ready.candidate@example.com',
    appliedRole: 'RBT',
    userId: stage === 'HIRED' ? USER_ID : null,
    ...validEvidence(),
    stage,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    async (operation: (tx: typeof mocks.tx) => Promise<unknown>) =>
      operation(mocks.tx)
  );
  mocks.tx.atsCandidate.findUnique.mockResolvedValue(
    transactionCandidate()
  );
  mocks.tx.atsCandidate.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.user.findUnique.mockResolvedValue(null);
  mocks.tx.user.findMany.mockResolvedValue([]);
  mocks.tx.user.create.mockResolvedValue({
    id: USER_ID,
    isActive: true,
  });
  mocks.tx.user.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.candidateOnboardingPacket.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.applicantDeviceSession.updateMany.mockResolvedValue({ count: 0 });
  mocks.tx.auditLogVault.create.mockResolvedValue({ id: 'hire-audit-id' });
  mocks.tx.client.findMany.mockResolvedValue([]);
  mocks.notifyUsers.mockResolvedValue({ success: true, notified: 0 });
});

describe('evaluateHireReadiness', () => {
  it('accepts the valid current evidence flow without trusting progress booleans', () => {
    const result = evaluateHireReadiness(validEvidence());

    expect(result).toEqual({
      ready: true,
      blockers: [],
      evidence: {
        ls54Version: 3,
        ls54ContentSha256: LS54_HASH,
        certificateStoragePath: `${CANDIDATE_ID}/40hr-cert.pdf`,
        completedOnboardingSteps: ONBOARDING_TOTAL_STEPS,
      },
    });
  });

  it.each([
    [
      'terminal candidate',
      (value: HireReadinessEvidence) => {
        value.stage = 'REJECTED';
        value.activationStatus = 'REJECTED';
      },
      'CANDIDATE_TERMINAL',
    ],
    [
      'wrong stage',
      (value: HireReadinessEvidence) => {
        value.stage = 'PHONE_SCREEN';
      },
      'STAGE_NOT_OFFER',
    ],
    [
      'unsigned current notice',
      (value: HireReadinessEvidence) => {
        value.onboardingPacket!.ls54Status = 'SENT';
        value.onboardingPacket!.ls54SignedAt = null;
      },
      'LS54_NOT_SIGNED',
    ],
    [
      'stale signed event',
      (value: HireReadinessEvidence) => {
        const event = value.signatureEvents.at(-1)!;
        event.quizAnswers = {
          version: 2,
          noticeContentSha256: 'stale-hash',
        };
      },
      'LS54_SIGNATURE_STALE',
    ],
    [
      'incomplete onboarding tasks',
      (value: HireReadinessEvidence) => {
        value.signatureEvents = value.signatureEvents.filter(
          (event) => event.stepNumber !== 27
        );
      },
      'ONBOARDING_TASKS_INCOMPLETE',
    ],
    [
      'invalid availability',
      (value: HireReadinessEvidence) => {
        value.onboardingPacket!.availabilityGrid = [];
      },
      'AVAILABILITY_INCOMPLETE',
    ],
    [
      'unapproved interview',
      (value: HireReadinessEvidence) => {
        value.interview = null;
      },
      'INTERVIEW_NOT_APPROVED',
    ],
    [
      'missing durable certificate',
      (value: HireReadinessEvidence) => {
        value.onboardingPacket!.formData = {
          fortyHourCoach: { step: 'UPLOADED' },
        };
      },
      'CERTIFICATE_EVIDENCE_MISSING',
    ],
    [
      'unverified certificate',
      (value: HireReadinessEvidence) => {
        value.bacbVerified = false;
      },
      'CERTIFICATE_REVIEW_REQUIRED',
    ],
    [
      'background not cleared',
      (value: HireReadinessEvidence) => {
        value.onboardingPacket!.backgroundCleared = false;
      },
      'BACKGROUND_CLEARANCE_REQUIRED',
    ],
  ])('reports the authoritative blocker for %s', (_label, mutate, blocker) => {
    const value = validEvidence();
    mutate(value);

    const result = evaluateHireReadiness(value);

    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.code)).toContain(blocker);
  });
});

describe('hireCandidateDomain transaction', () => {
  it('atomically creates the internal profile, transitions the candidate, revokes link rebinding, and audits', async () => {
    mocks.tx.client.findMany.mockResolvedValue([
      { bcbaId: ACTOR_ID, caseCoordinatorId: null },
    ]);

    const result = await hireCandidateDomain({
      candidateId: CANDIDATE_ID,
      actorUserId: ACTOR_ID,
      actorRole: 'HEAD_HR',
    });

    expect(result).toEqual({
      success: true,
      candidateId: CANDIDATE_ID,
      userId: USER_ID,
      alreadyHired: false,
      supabaseAuthProvisioned: false,
      accessMode: 'CANDIDATE_DEVICE_SESSION',
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );
    expect(mocks.tx.user.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.atsCandidate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CANDIDATE_ID,
        stage: 'OFFER',
        userId: null,
      },
      data: {
        userId: USER_ID,
        stage: 'HIRED',
        activationStatus: 'ACTIVE',
      },
    });
    expect(
      mocks.tx.candidateOnboardingPacket.updateMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          candidateId: CANDIDATE_ID,
          ls54Status: 'SIGNED',
        }),
        data: { magicLinkRevokedAt: expect.any(Date) },
      })
    );
    expect(mocks.tx.applicantDeviceSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLogVault.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: expect.any(String),
        action: 'HIRE',
        resourceType: 'ATS_CANDIDATE',
        resourceId: CANDIDATE_ID,
        metadata: expect.objectContaining({
          supabaseAuthProvisioned: false,
          accessMode: 'CANDIDATE_DEVICE_SESSION',
          ls54Version: 3,
          ls54ContentSha256: LS54_HASH,
        }),
      }),
    });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [ACTOR_ID],
        type: 'RBT_HIRED',
      }),
      mocks.tx
    );
  });

  it('reactivates an existing inactive internal profile in the same transaction', async () => {
    mocks.tx.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'ready.candidate@example.com',
      isActive: false,
    });

    const result = await hireCandidateDomain({
      candidateId: CANDIDATE_ID,
      actorUserId: ACTOR_ID,
      actorRole: 'HR',
    });

    expect(result).toMatchObject({ success: true, userId: USER_ID });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, isActive: false },
      data: {
        isActive: true,
        role: 'RBT',
        firstName: 'Ready',
        lastName: 'Candidate',
      },
    });
  });

  it('rejects an existing active-email collision before candidate or audit writes', async () => {
    mocks.tx.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'ready.candidate@example.com',
      isActive: true,
    });

    const result = await hireCandidateDomain({
      candidateId: CANDIDATE_ID,
      actorUserId: ACTOR_ID,
      actorRole: 'HEAD_HR',
    });

    expect(result).toMatchObject({
      success: false,
      code: 'ACTIVE_EMAIL_COLLISION',
    });
    expect(mocks.tx.atsCandidate.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
  });

  it('returns the same durable outcome for an already-hired replay without new writes', async () => {
    mocks.tx.atsCandidate.findUnique.mockResolvedValue(
      transactionCandidate('HIRED')
    );
    mocks.tx.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'ready.candidate@example.com',
      isActive: true,
    });

    const result = await hireCandidateDomain({
      candidateId: CANDIDATE_ID,
      actorUserId: ACTOR_ID,
      actorRole: 'HEAD_HR',
    });

    expect(result).toEqual({
      success: true,
      candidateId: CANDIDATE_ID,
      userId: USER_ID,
      alreadyHired: true,
      supabaseAuthProvisioned: false,
      accessMode: 'CANDIDATE_DEVICE_SESSION',
    });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.user.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.atsCandidate.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
  });

  it.each(['P2034', 'P2002'])(
    'retries duplicate-hire database conflict %s and returns the winner durable outcome',
    async (conflictCode) => {
      mocks.tx.atsCandidate.findUnique
        .mockResolvedValueOnce(transactionCandidate())
        .mockResolvedValueOnce(transactionCandidate('HIRED'));
      mocks.tx.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: USER_ID,
          email: 'ready.candidate@example.com',
          isActive: true,
        });
      let attempt = 0;
      mocks.prisma.$transaction.mockImplementation(
        async (operation: (tx: typeof mocks.tx) => Promise<unknown>) => {
          const value = await operation(mocks.tx);
          attempt += 1;
          if (attempt === 1) {
            throw Object.assign(new Error('write conflict'), {
              code: conflictCode,
            });
          }
          return value;
        }
      );

      const result = await hireCandidateDomain({
        candidateId: CANDIDATE_ID,
        actorUserId: ACTOR_ID,
        actorRole: 'HEAD_HR',
      });

      expect(result).toMatchObject({
        success: true,
        userId: USER_ID,
        alreadyHired: true,
      });
      expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    }
  );

  it('re-reads the durable winner when the expected-current candidate update loses a race', async () => {
    mocks.tx.atsCandidate.findUnique
      .mockResolvedValueOnce(transactionCandidate())
      .mockResolvedValueOnce(transactionCandidate('HIRED'));
    mocks.tx.atsCandidate.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.tx.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: USER_ID,
        email: 'ready.candidate@example.com',
        isActive: true,
      });

    const result = await hireCandidateDomain({
      candidateId: CANDIDATE_ID,
      actorUserId: ACTOR_ID,
      actorRole: 'HEAD_HR',
    });

    expect(result).toMatchObject({
      success: true,
      userId: USER_ID,
      alreadyHired: true,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it.each(['user', 'candidate', 'audit', 'notification'] as const)(
    'fails the transaction when the %s write fails so earlier writes roll back',
    async (failurePoint) => {
      if (failurePoint === 'user') {
        mocks.tx.user.create.mockRejectedValue(new Error('user write failed'));
      }
      if (failurePoint === 'candidate') {
        mocks.tx.atsCandidate.updateMany.mockResolvedValue({ count: 0 });
      }
      if (failurePoint === 'audit') {
        mocks.tx.auditLogVault.create.mockRejectedValue(
          new Error('audit write failed')
        );
      }
      if (failurePoint === 'notification') {
        mocks.notifyUsers.mockResolvedValue({
          success: false,
          notified: 0,
          error: 'notification write failed',
        });
      }

      const result = await hireCandidateDomain({
        candidateId: CANDIDATE_ID,
        actorUserId: ACTOR_ID,
        actorRole: 'HEAD_HR',
      });

      expect(result).toMatchObject({
        success: false,
        code: 'HIRE_TRANSACTION_FAILED',
      });
    }
  );
});
