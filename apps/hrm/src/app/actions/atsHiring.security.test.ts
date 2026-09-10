import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireStaff: vi.fn(),
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  hireCandidateDomain: vi.fn(),
  notifyUsers: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    atsCandidate: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    applicantDeviceSession: {
      updateMany: vi.fn(),
    },
    candidateOnboardingPacket: {
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  HR_ROLES: ['HEAD_HR', 'HR', 'HR_AGENT'],
  requireRole: mocks.requireRole,
  requireStaff: mocks.requireStaff,
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/hiringDomain', () => ({
  hireCandidateDomain: mocks.hireCandidateDomain,
}));
vi.mock('@/app/actions/notifications', () => ({
  notifyUsers: mocks.notifyUsers,
}));
vi.mock('@/lib/magicLinkExpiry', () => ({
  newMagicLinkExpiry: () => new Date('2026-08-19T12:00:00.000Z'),
}));
vi.mock('@/lib/resolveActingRbt', () => ({
  resolveActingRbtContext: vi.fn(),
}));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/rbtManagerMetrics', () => ({
  formatManagerEtDate: vi.fn(),
  formatManagerEtTimestamp: vi.fn(),
  getRbtManagerWeekWindow: vi.fn(),
  summarizeRbtManagerWork: vi.fn(),
}));
vi.mock('@/lib/clinicTimezone', () => ({ startOfClinicDay: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  advanceAtsStage,
  deleteAtsCandidate,
  hireCandidate,
  setAtsStage,
} from './atsActions';

function candidate(stage = 'OFFER') {
  return {
    id: CANDIDATE_ID,
    firstName: 'Security',
    lastName: 'Candidate',
    email: 'security.candidate@example.com',
    phone: null,
    appliedRole: 'RBT',
    stage,
    activationStatus: 'ACTIVE',
    userId: null,
    dossier: {},
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    onboardingPacket: {
      magicLinkToken: 'current-token',
      tasksDone: false,
      tasksCompletedSteps: [],
      availabilityDone: false,
      availabilityGrid: [],
      preferredBoroughs: [],
      transportation: null,
      maxTravelMiles: 15,
      simulationDone: false,
      interviewBooked: false,
      interviewPassed: false,
      certUploaded: false,
      backgroundCleared: false,
      clearedForHire: false,
      formData: {},
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ id: ACTOR_ID, role: 'HEAD_HR' });
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: ACTOR_ID, role: 'HEAD_HR', isActive: true },
  });
  mocks.hireCandidateDomain.mockResolvedValue({
    success: true,
    candidateId: CANDIDATE_ID,
    userId: '33333333-3333-4333-8333-333333333333',
    alreadyHired: false,
    supabaseAuthProvisioned: false,
    accessMode: 'CANDIDATE_DEVICE_SESSION',
  });
  mocks.notifyUsers.mockResolvedValue({ success: true, notified: 1 });
  mocks.prisma.atsCandidate.findUnique.mockResolvedValue(null);
  mocks.prisma.atsCandidate.update.mockResolvedValue(candidate('HIRED'));
  mocks.prisma.$transaction.mockImplementation(
    async (operation: (tx: typeof mocks.prisma) => unknown) => operation(mocks.prisma)
  );
});

describe('ATS hiring Server Action boundary', () => {
  it('ignores legacy bypass-shaped input and performs zero writes when unauthenticated', async () => {
    mocks.requireStaff.mockResolvedValue({
      ok: false,
      error: 'Not authenticated. Please sign in.',
    });

    const legacyCall = hireCandidate as unknown as (
      candidateId: string,
      options: { skipLs54Gate: boolean; headHrOverride: boolean }
    ) => ReturnType<typeof hireCandidate>;
    const result = await legacyCall(CANDIDATE_ID, {
      skipLs54Gate: true,
      headHrOverride: true,
    });

    expect(result).toEqual({
      success: false,
      error: 'Not authenticated. Please sign in.',
    });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
    expect(mocks.hireCandidateDomain).not.toHaveBeenCalled();
  });

  it.each([
    'Not authenticated. Please sign in.',
    'You are not authorized to perform this action.',
  ])('denies inactive or wrong-role staff before sensitive reads: %s', async (error) => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error });

    const result = await hireCandidate(CANDIDATE_ID);

    expect(result).toEqual({ success: false, error });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.hireCandidateDomain).not.toHaveBeenCalled();
  });

  it('has no client-visible authorization options in its runtime signature', () => {
    expect(hireCandidate.length).toBe(1);
  });

  it('rejects HIRED in generic stage mutation without writing', async () => {
    const result = await setAtsStage(CANDIDATE_ID, 'HIRED');

    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/canonical hiring action/i),
    });
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
  });

  it('does not let generic advance become a second hiring entry point', async () => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue(
      candidate('OFFER')
    );

    const result = await advanceAtsStage(CANDIDATE_ID);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/final hire action/i),
    });
    expect(mocks.hireCandidateDomain).not.toHaveBeenCalled();
  });

  it('does not overwrite a newer board move with a stale advance', async () => {
    mocks.prisma.atsCandidate.findUnique
      .mockResolvedValueOnce(candidate('PHONE_SCREEN'))
      .mockResolvedValueOnce(candidate('OFFER'));

    const result = await advanceAtsStage(CANDIDATE_ID);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/stage changed/i),
    });
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
  });

  it('delegates the internal notification enqueue to the transactional domain service', async () => {
    const result = await hireCandidate(CANDIDATE_ID);

    expect(result).toMatchObject({
      success: true,
      candidateId: CANDIDATE_ID,
      alreadyHired: false,
    });
    expect(mocks.hireCandidateDomain).toHaveBeenCalledWith({
      candidateId: CANDIDATE_ID,
      actorUserId: ACTOR_ID,
      actorRole: 'HEAD_HR',
      notificationLinkUrl: expect.stringMatching(/\/portal-clinical$/),
    });
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });
});

describe('ATS candidate deletion retention boundary', () => {
  const pristineCandidate = {
    stage: 'APPLIED',
    activationStatus: 'PENDING_HR_REVIEW',
    userId: null,
    interview: null,
    _count: {
      helpTickets: 0,
      interviewRecordings: 0,
      deviceSessions: 0,
      signatureEvents: 0,
    },
    onboardingPacket: {
      inviteSentAt: null,
      inviteAcceptedAt: null,
      resumeStoragePath: null,
      govtIdStoragePath: null,
      ls54StoragePath: null,
      w4Complete: false,
      i9Complete: false,
      directDepositComplete: false,
      cprUploaded: false,
      tasksDone: false,
      availabilityDone: false,
      simulationDone: false,
      interviewBooked: false,
      interviewPassed: false,
      certUploaded: false,
      backgroundCleared: false,
      clearedForHire: false,
    },
  };

  it('denies unauthenticated deletion before reading candidate data', async () => {
    mocks.requireStaff.mockResolvedValue({
      ok: false,
      error: 'Not authenticated. Please sign in.',
    });

    const result = await deleteAtsCandidate(CANDIDATE_ID);

    expect(result).toEqual({ success: false, error: 'Not authenticated. Please sign in.' });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.delete).not.toHaveBeenCalled();
  });

  it('retains candidates with durable onboarding evidence', async () => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue({
      ...pristineCandidate,
      onboardingPacket: {
        ...pristineCandidate.onboardingPacket,
        resumeStoragePath: `${CANDIDATE_ID}/resume.pdf`,
      },
    });

    const result = await deleteAtsCandidate(CANDIDATE_ID);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/must be retained/i),
    });
    expect(mocks.prisma.atsCandidate.delete).not.toHaveBeenCalled();
  });

  it('deletes only a pristine application inside a serializable transaction', async () => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue(pristineCandidate);
    mocks.prisma.atsCandidate.delete.mockResolvedValue({ id: CANDIDATE_ID });

    const result = await deleteAtsCandidate(CANDIDATE_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.atsCandidate.delete).toHaveBeenCalledWith({
      where: { id: CANDIDATE_ID },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );
  });
});
