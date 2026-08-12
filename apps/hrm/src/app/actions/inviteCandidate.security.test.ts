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

import { inviteCandidate, setAtsStage } from './atsActions';

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
});

describe('terminal candidate session revocation', () => {
  it('revokes live device sessions and the packet link when HR rejects a candidate', async () => {
    mocks.prisma.atsCandidate.update.mockResolvedValue(
      candidate(PRE_APPROVAL_TOKEN, 'REJECTED')
    );

    const result = await setAtsStage(CANDIDATE_ID, 'REJECTED', 'REJECTED');

    expect(result).toMatchObject({ success: true });
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
