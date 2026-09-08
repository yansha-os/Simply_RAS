import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';
const UPLOAD_ONLY_TOKEN = 'pending-upload-only-token';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn((name: string) => {
    if (name === 'device_fingerprint') return { value: FINGERPRINT };
    return undefined;
  }),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  headerGet: vi.fn(() => null),
  revalidatePath: vi.fn(),
  requireRole: vi.fn(),
  resolveFingerprintValidCandidate: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    candidateOnboardingPacket: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    applicantDeviceSession: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    atsCandidate: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/candidateDeviceSession', () => ({
  resolveFingerprintValidCandidate: mocks.resolveFingerprintValidCandidate,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  })),
  headers: vi.fn(async () => ({ get: mocks.headerGet })),
}));

import {
  bindMagicLinkSession,
  promoteHiredSessionToRbt,
} from './applicantSessionActions';

function packet(stage: string, activationStatus: string) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    candidateId: CANDIDATE_ID,
    magicLinkToken: UPLOAD_ONLY_TOKEN,
    magicLinkExpiresAt: new Date('2099-08-19T12:00:00.000Z'),
    magicLinkRevokedAt: null,
    deviceFingerprint: null,
    deviceBoundAt: null,
    inviteAcceptedAt: null,
    candidate: {
      id: CANDIDATE_ID,
      firstName: 'Pending',
      lastName: 'Applicant',
      email: 'pending@example.com',
      stage,
      activationStatus,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveFingerprintValidCandidate.mockResolvedValue(null);
  mocks.prisma.$transaction.mockImplementation(
    async (operation: (tx: typeof mocks.prisma) => unknown) => operation(mocks.prisma)
  );
  mocks.prisma.applicantDeviceSession.upsert.mockResolvedValue({});
  mocks.prisma.candidateOnboardingPacket.update.mockResolvedValue({});
  mocks.prisma.atsCandidate.update.mockResolvedValue({});
});

describe('promoteHiredSessionToRbt device binding', () => {
  it('does not trust a raw hired-candidate UUID cookie without fingerprint validation', async () => {
    mocks.cookieGet.mockImplementation((name: string) => {
      if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
      if (name === 'device_fingerprint') return { value: FINGERPRINT };
      return undefined;
    });

    const result = await promoteHiredSessionToRbt();

    expect(result).toMatchObject({ success: false });
    expect(mocks.resolveFingerprintValidCandidate).toHaveBeenCalledWith(
      CANDIDATE_ID,
      FINGERPRINT
    );
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('promotes only the fingerprint-validated hired candidate', async () => {
    mocks.cookieGet.mockImplementation((name: string) => {
      if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
      if (name === 'device_fingerprint') return { value: FINGERPRINT };
      return undefined;
    });
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: CANDIDATE_ID,
      userId: '55555555-5555-4555-8555-555555555555',
      stage: 'HIRED',
      activationStatus: 'ACTIVE',
    });
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue({
      id: CANDIDATE_ID,
      firstName: 'Hired',
      lastName: 'RBT',
      email: 'hired@example.test',
      stage: 'HIRED',
    });

    const result = await promoteHiredSessionToRbt();

    expect(result).toMatchObject({
      success: true,
      data: { candidateId: CANDIDATE_ID, stage: 'HIRED', isHired: true },
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      'ras_hrm_role',
      'RBT',
      expect.any(Object)
    );
  });
});

describe('bindMagicLinkSession applicant-access separation', () => {
  it('does not bind the upload-only token issued to a pending applicant', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue(
      packet('APPLIED', 'PENDING_HR_REVIEW')
    );

    const result = await bindMagicLinkSession(UPLOAD_ONLY_TOKEN);

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/pending|invite|portal/i);
    expect(mocks.prisma.applicantDeviceSession.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.candidateOnboardingPacket.update).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a rejected candidate without restoring a device session', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue(
      packet('REJECTED', 'REJECTED')
    );

    const result = await bindMagicLinkSession(UPLOAD_ONLY_TOKEN);

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.applicantDeviceSession.upsert).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('rejects an old token after invitation rotation', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue(null);

    const result = await bindMagicLinkSession('rotated-away-token');

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.applicantDeviceSession.upsert).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('fails closed when a legacy invite has no expiry', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue({
      ...packet('PHONE_SCREEN', 'INVITATION_SENT'),
      magicLinkExpiresAt: null,
    });

    const result = await bindMagicLinkSession(UPLOAD_ONLY_TOKEN);

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('binds the current HR-invited token and activates the applicant session', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue(
      packet('PHONE_SCREEN', 'INVITATION_SENT')
    );

    const result = await bindMagicLinkSession(UPLOAD_ONLY_TOKEN);

    expect(result).toMatchObject({
      success: true,
      data: {
        candidateId: CANDIDATE_ID,
        stage: 'PHONE_SCREEN',
        isHired: false,
      },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );
    expect(mocks.prisma.applicantDeviceSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          candidateId: CANDIDATE_ID,
          magicLinkToken: UPLOAD_ONLY_TOKEN,
        }),
      })
    );
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith({
      where: { id: CANDIDATE_ID },
      data: { activationStatus: 'ACTIVE' },
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      'ras_device_session_token',
      CANDIDATE_ID,
      expect.any(Object)
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      'ras_hrm_role',
      'APPLICANT',
      expect.any(Object)
    );
  });

  it('keeps hired RBT device login explicit while candidate uploads stay terminally denied', async () => {
    mocks.prisma.candidateOnboardingPacket.findUnique.mockResolvedValue(
      packet('HIRED', 'ACTIVE')
    );

    const result = await bindMagicLinkSession(UPLOAD_ONLY_TOKEN);

    expect(result).toMatchObject({
      success: true,
      data: { candidateId: CANDIDATE_ID, stage: 'HIRED', isHired: true },
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      'ras_hrm_role',
      'RBT',
      expect.any(Object)
    );
  });
});
