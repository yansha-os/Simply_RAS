import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const RBT_ID = '22222222-2222-4222-8222-222222222222';
const OPENING_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  resolveActingRbtContext: vi.fn(),
  resolveActingRbtUserId: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    atsCandidate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    caseOpening: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    caseApplication: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    candidateOnboardingPacket: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/resolveActingRbt', () => ({
  resolveActingRbtContext: mocks.resolveActingRbtContext,
  resolveActingRbtUserId: mocks.resolveActingRbtUserId,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { applyToCaseOpening, saveRbtTravelProfile } from './caseOpeningActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveActingRbtContext.mockResolvedValue({
    candidateId: null,
    rbtUserId: RBT_ID,
  });
  mocks.prisma.atsCandidate.findFirst.mockResolvedValue(null);
  mocks.resolveActingRbtUserId.mockResolvedValue(RBT_ID);
  mocks.prisma.caseOpening.findUnique.mockResolvedValue({
    id: OPENING_ID,
    clientId: CANDIDATE_ID,
    caseCode: 'CASE-101',
    status: 'OPEN',
  });
  mocks.prisma.caseApplication.findUnique.mockResolvedValue(null);
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma)
  );
});

describe('applyToCaseOpening integrity', () => {
  it('rejects malformed opening ids before resolving identity or querying Prisma', async () => {
    const result = await applyToCaseOpening('not-an-id');

    expect(result).toEqual({
      success: false,
      error: 'This opening is no longer available.',
    });
    expect(mocks.resolveActingRbtUserId).not.toHaveBeenCalled();
    expect(mocks.prisma.caseOpening.findUnique).not.toHaveBeenCalled();
  });

  it('rejects oversized applicant messages before any database access', async () => {
    const result = await applyToCaseOpening(OPENING_ID, 'x'.repeat(2_001));

    expect(result).toEqual({
      success: false,
      error: 'Application message must be 2,000 characters or fewer.',
    });
    expect(mocks.resolveActingRbtUserId).not.toHaveBeenCalled();
    expect(mocks.prisma.caseOpening.findUnique).not.toHaveBeenCalled();
  });

  it('does not create an application when the opening closes during submission', async () => {
    mocks.prisma.caseOpening.updateMany.mockResolvedValue({ count: 0 });

    const result = await applyToCaseOpening(OPENING_ID, 'Available weekdays');

    expect(result).toEqual({
      success: false,
      error: 'This opening is no longer available.',
    });
    expect(mocks.prisma.caseOpening.updateMany).toHaveBeenCalledWith({
      where: { id: OPENING_ID, status: 'OPEN' },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.prisma.caseApplication.create).not.toHaveBeenCalled();
  });
});

describe('saveRbtTravelProfile ownership', () => {
  it('does not attach an unlinked RBT to an arbitrary hired candidate', async () => {
    const result = await saveRbtTravelProfile({
      homeZipCode: '11372',
      maxTravelMiles: 15,
    });

    expect(result).toEqual({
      success: false,
      error: 'No onboarding profile found to save travel preferences. Complete availability first.',
    });
    expect(mocks.prisma.atsCandidate.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.atsCandidate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: RBT_ID } })
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the fingerprint-validated candidate id for an applicant device session', async () => {
    mocks.resolveActingRbtContext.mockResolvedValue({
      candidateId: CANDIDATE_ID,
      rbtUserId: null,
    });
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue(null);

    const result = await saveRbtTravelProfile({ homeZipCode: '11372' });

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.atsCandidate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CANDIDATE_ID } })
    );
    expect(mocks.prisma.atsCandidate.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
