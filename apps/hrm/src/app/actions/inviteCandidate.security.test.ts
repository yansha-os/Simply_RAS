import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const PRE_APPROVAL_TOKEN = 'pre-approval-upload-token';

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    atsCandidate: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    candidateOnboardingPacket: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    applicantDeviceSession: {
      updateMany: vi.fn(),
    },
  };

  return {
    prisma,
    requireRole: vi.fn(),
    requireStaff: vi.fn(),
    getCurrentUser: vi.fn(),
    revalidatePath: vi.fn(),
    newMagicLinkExpiry: vi.fn(() => new Date('2026-08-19T12:00:00.000Z')),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  HR_ROLES: ['HEAD_HR', 'HR', 'HR_AGENT'],
  requireRole: mocks.requireRole,
  requireStaff: mocks.requireStaff,
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/magicLinkExpiry', () => ({
  newMagicLinkExpiry: mocks.newMagicLinkExpiry,
  isMagicLinkExpiryCurrent: (expiresAt: Date | null, now = Date.now()) =>
    Boolean(expiresAt && expiresAt.getTime() > now),
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
  addAtsCandidate,
  getActiveCandidateMagicLink,
  inviteCandidate,
  resetCandidateDeviceLock,
  setAtsStage,
} from './atsActions';

function candidate(token: string, activationStatus = 'PENDING_HR_REVIEW') {
  return {
    id: CANDIDATE_ID,
    firstName: 'New',
    lastName: 'Applicant',
    email: 'new@example.com',
    phone: '(555) 123-4567',
    appliedRole: 'RBT',
    stage: activationStatus === 'PENDING_HR_REVIEW' ? 'APPLIED' : 'PHONE_SCREEN',
    activationStatus,
    userId: null,
    dossier: {},
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    onboardingPacket: {
      id: '22222222-2222-4222-8222-222222222222',
      candidateId: CANDIDATE_ID,
      magicLinkToken: token,
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
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({
    id: '33333333-3333-4333-8333-333333333333',
    role: 'HR',
  });
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      role: 'HR',
      isActive: true,
    },
  });
  mocks.prisma.$transaction.mockImplementation(
    async (operation: (tx: typeof mocks.prisma) => unknown) => operation(mocks.prisma)
  );
  mocks.prisma.atsCandidate.findUnique.mockResolvedValue(
    candidate(PRE_APPROVAL_TOKEN)
  );
  mocks.prisma.candidateOnboardingPacket.update.mockResolvedValue({});
  mocks.prisma.candidateOnboardingPacket.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.applicantDeviceSession.updateMany.mockResolvedValue({ count: 2 });
  mocks.prisma.atsCandidate.update.mockResolvedValue(
    candidate('new-invited-token', 'INVITATION_SENT')
  );
});

describe('inviteCandidate access rotation', () => {
  it('rotates the pre-approval token and revokes every prior device session', async () => {
    const result = await inviteCandidate(CANDIDATE_ID);

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);

    const packetUpdate =
      mocks.prisma.candidateOnboardingPacket.update.mock.calls[0]?.[0];
    const rotatedToken = packetUpdate?.data?.magicLinkToken;
    expect(rotatedToken).toEqual(expect.any(String));
    expect(rotatedToken).not.toBe(PRE_APPROVAL_TOKEN);

    expect(mocks.prisma.applicantDeviceSession.updateMany).toHaveBeenCalledWith({
      where: { candidateId: CANDIDATE_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CANDIDATE_ID },
        data: {
          stage: 'PHONE_SCREEN',
          activationStatus: 'INVITATION_SENT',
        },
      })
    );

    expect(result.magicLinkUrl).toContain(rotatedToken);
    expect(result.magicLinkUrl).not.toContain(PRE_APPROVAL_TOKEN);
  });

  it('keeps explicit reinvite retries safe by issuing a new latest token each time', async () => {
    const first = await inviteCandidate(CANDIDATE_ID);
    const second = await inviteCandidate(CANDIDATE_ID);

    expect(first).toMatchObject({ success: true });
    expect(second).toMatchObject({ success: true });

    const firstToken =
      mocks.prisma.candidateOnboardingPacket.update.mock.calls[0]?.[0]?.data
        ?.magicLinkToken;
    const secondToken =
      mocks.prisma.candidateOnboardingPacket.update.mock.calls[1]?.[0]?.data
        ?.magicLinkToken;
    expect(firstToken).toEqual(expect.any(String));
    expect(secondToken).toEqual(expect.any(String));
    expect(secondToken).not.toBe(firstToken);
    expect(first.magicLinkUrl).toContain(firstToken);
    expect(second.magicLinkUrl).toContain(secondToken);
    expect(mocks.prisma.applicantDeviceSession.updateMany).toHaveBeenCalledTimes(2);
  });
  it.each(['HIRED', 'REJECTED'])('does not resurrect a %s candidate', async (stage) => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue({
      ...candidate(PRE_APPROVAL_TOKEN),
      stage,
    });

    const result = await inviteCandidate(CANDIDATE_ID);

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/cannot be invited again/i);
    expect(mocks.prisma.candidateOnboardingPacket.update).not.toHaveBeenCalled();
    expect(mocks.prisma.applicantDeviceSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
  });
});

describe('terminal candidate session revocation', () => {
  it('revokes live device sessions and the packet link when HR rejects a candidate', async () => {
    mocks.prisma.atsCandidate.update.mockResolvedValue(
      candidate(PRE_APPROVAL_TOKEN, 'REJECTED')
    );

    const result = await setAtsStage(CANDIDATE_ID, 'REJECTED', 'REJECTED');

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );
    expect(mocks.prisma.applicantDeviceSession.updateMany).toHaveBeenCalledWith({
      where: { candidateId: CANDIDATE_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.prisma.candidateOnboardingPacket.updateMany).toHaveBeenCalledWith({
      where: { candidateId: CANDIDATE_ID },
      data: { magicLinkRevokedAt: expect.any(Date) },
    });
  });
});

describe('candidate device-lock reset', () => {
  it('denies unauthorized reset attempts before database access', async () => {
    mocks.requireStaff.mockResolvedValue({
      ok: false,
      error: 'Not authenticated. Please sign in.',
    });

    const result = await resetCandidateDeviceLock(CANDIDATE_ID);

    expect(result).toEqual({ success: false, error: 'Not authenticated. Please sign in.' });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses reset when the retained invitation is no longer active', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      magicLinkToken: PRE_APPROVAL_TOKEN,
      magicLinkExpiresAt: new Date('2026-08-01T12:00:00.000Z'),
      magicLinkRevokedAt: null,
    });

    const result = await resetCandidateDeviceLock(CANDIDATE_ID);

    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/expired/i) });
    expect(mocks.prisma.applicantDeviceSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.candidateOnboardingPacket.update).not.toHaveBeenCalled();
  });

  it('revokes live sessions and clears the packet binding atomically', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      magicLinkToken: PRE_APPROVAL_TOKEN,
      magicLinkExpiresAt: new Date(Date.now() + 60_000),
      magicLinkRevokedAt: null,
    });
    mocks.prisma.applicantDeviceSession.updateMany.mockResolvedValue({ count: 2 });

    const result = await resetCandidateDeviceLock(CANDIDATE_ID);

    expect(result).toEqual({ success: true, revokedSessions: 2 });
    expect(mocks.prisma.applicantDeviceSession.updateMany).toHaveBeenCalledWith({
      where: { candidateId: CANDIDATE_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.prisma.candidateOnboardingPacket.update).toHaveBeenCalledWith({
      where: { id: '22222222-2222-4222-8222-222222222222' },
      data: { deviceFingerprint: null, deviceBoundAt: null },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );
  });
});

describe('active candidate invitation lookup', () => {
  it('does not read invitation data for unauthorized staff', async () => {
    mocks.requireStaff.mockResolvedValue({
      ok: false,
      error: 'You are not authorized to perform this action.',
    });

    const result = await getActiveCandidateMagicLink(CANDIDATE_ID);

    expect(result).toEqual({
      success: false,
      error: 'You are not authorized to perform this action.',
    });
    expect(mocks.prisma.candidateOnboardingPacket.findUnique).not.toHaveBeenCalled();
  });

  it('returns no capability for a revoked invitation', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue({
      magicLinkToken: PRE_APPROVAL_TOKEN,
      magicLinkExpiresAt: new Date(Date.now() + 60_000),
      magicLinkRevokedAt: new Date(),
    });

    const result = await getActiveCandidateMagicLink(CANDIDATE_ID);

    expect(result).toMatchObject({ success: false });
    expect(result).not.toHaveProperty('magicLinkUrl');
    expect(JSON.stringify(result)).not.toContain(PRE_APPROVAL_TOKEN);
  });

  it('returns the URL only for a currently active invitation', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue({
      magicLinkToken: PRE_APPROVAL_TOKEN,
      magicLinkExpiresAt: new Date(Date.now() + 60_000),
      magicLinkRevokedAt: null,
    });

    const result = await getActiveCandidateMagicLink(CANDIDATE_ID);

    expect(result).toEqual({
      success: true,
      magicLinkUrl: `http://localhost:3001/magic-link/${PRE_APPROVAL_TOKEN}`,
    });
  });
});

describe('staff-created candidate input integrity', () => {
  it.each([
    ['invalid email', { name: 'New Candidate', email: 'not-an-email', experienceYears: 1 }],
    ['oversized name', { name: 'x'.repeat(161), email: 'new@example.com', experienceYears: 1 }],
    ['negative experience', { name: 'New Candidate', email: 'new@example.com', experienceYears: -1 }],
    ['fractional experience', { name: 'New Candidate', email: 'new@example.com', experienceYears: 1.5 }],
  ])('rejects %s before querying or writing', async (_label, invalid) => {
    const result = await addAtsCandidate({
      ...invalid,
      roleApplied: 'RBT',
    });

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
  });
});
