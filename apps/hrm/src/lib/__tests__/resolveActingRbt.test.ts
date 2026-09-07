import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FORGED_CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const RBT_USER_ID = '33333333-3333-4333-8333-333333333333';
const AUTHENTICATED_RBT_ID = '44444444-4444-4444-8444-444444444444';
const FINGERPRINT = '55555555-5555-4555-8555-555555555555';
const OTHER_FINGERPRINT = '66666666-6666-4666-8666-666666666666';

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  findDeviceSession: vi.fn(),
  findCandidateById: vi.fn(),
  findCandidateByUser: vi.fn(),
  findUser: vi.fn(),
  getCurrentUser: vi.fn(),
  isDevToolsEnabled: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get(name: string) {
      const value = mocks.cookieValues.get(name);
      return value ? { name, value } : undefined;
    },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    applicantDeviceSession: {
      findUnique: mocks.findDeviceSession,
    },
    atsCandidate: {
      findUnique: mocks.findCandidateById,
      findFirst: mocks.findCandidateByUser,
    },
    user: {
      findFirst: mocks.findUser,
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@/lib/devToolsGate', () => ({
  isDevToolsEnabled: mocks.isDevToolsEnabled,
}));

import { resolveActingRbtContext } from '../resolveActingRbt';

function candidate(
  id = CANDIDATE_ID,
  stage = 'HIRED',
  userId: string | null = RBT_USER_ID,
  activationStatus = 'ACTIVE'
) {
  return { id, stage, userId, activationStatus };
}

function activeDeviceSession(
  candidateRecord = candidate(),
  fingerprint = FINGERPRINT
) {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    candidateId: candidateRecord.id,
    deviceFingerprint: fingerprint,
    revokedAt: null,
    boundAt: new Date(),
    candidate: candidateRecord,
  };
}

function setCandidateCookies(
  candidateId: string | null = CANDIDATE_ID,
  fingerprint: string | null = FINGERPRINT
) {
  if (candidateId) {
    mocks.cookieValues.set('ras_device_session_token', candidateId);
  }
  if (fingerprint) {
    mocks.cookieValues.set('device_fingerprint', fingerprint);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieValues.clear();
  mocks.findDeviceSession.mockResolvedValue(null);
  mocks.findCandidateById.mockResolvedValue(candidate());
  mocks.findCandidateByUser.mockResolvedValue(null);
  mocks.findUser.mockResolvedValue(null);
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.isDevToolsEnabled.mockReturnValue(false);
});

describe.sequential('resolveActingRbtContext candidate device-session security', () => {
  it('accepts a fingerprint-matched active hired candidate session', async () => {
    setCandidateCookies();
    mocks.findDeviceSession.mockResolvedValue(activeDeviceSession());
    mocks.findUser.mockResolvedValue({ id: RBT_USER_ID });

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: CANDIDATE_ID,
      rbtUserId: RBT_USER_ID,
    });
    expect(mocks.findDeviceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          candidateId_deviceFingerprint: {
            candidateId: CANDIDATE_ID,
            deviceFingerprint: FINGERPRINT,
          },
        },
      })
    );
    expect(mocks.findCandidateById).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('revokes a hired device session when the linked RBT account is inactive', async () => {
    setCandidateCookies();
    mocks.findDeviceSession.mockResolvedValue(activeDeviceSession());
    mocks.findUser.mockResolvedValue(null);

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: null,
      rbtUserId: null,
    });
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: {
        id: RBT_USER_ID,
        role: 'RBT',
        isActive: true,
      },
      select: { id: true },
    });
  });

  it('accepts a fingerprint-matched active applicant session without inventing an RBT', async () => {
    const applicant = candidate(CANDIDATE_ID, 'INTERVIEW', null);
    setCandidateCookies();
    mocks.findDeviceSession.mockResolvedValue(activeDeviceSession(applicant));

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: CANDIDATE_ID,
      rbtUserId: null,
    });
    expect(mocks.findDeviceSession).toHaveBeenCalledOnce();
  });

  it('rejects a forged candidate cookie with no persisted device session', async () => {
    setCandidateCookies(FORGED_CANDIDATE_ID, FINGERPRINT);
    mocks.findCandidateById.mockResolvedValue(
      candidate(FORGED_CANDIDATE_ID, 'HIRED', RBT_USER_ID)
    );

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: null,
      rbtUserId: null,
    });
  });

  it('rejects a candidate cookie when the fingerprint cookie is missing', async () => {
    setCandidateCookies(CANDIDATE_ID, null);

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: null,
      rbtUserId: null,
    });
    expect(mocks.findDeviceSession).not.toHaveBeenCalled();
  });

  it('rejects a candidate cookie with a mismatched fingerprint', async () => {
    setCandidateCookies(CANDIDATE_ID, OTHER_FINGERPRINT);

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: null,
      rbtUserId: null,
    });
    expect(mocks.findDeviceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          candidateId_deviceFingerprint: {
            candidateId: CANDIDATE_ID,
            deviceFingerprint: OTHER_FINGERPRINT,
          },
        },
      })
    );
  });

  it('rejects a revoked candidate device session', async () => {
    setCandidateCookies();
    mocks.findDeviceSession.mockResolvedValue({
      ...activeDeviceSession(),
      revokedAt: new Date('2026-08-12T08:00:00.000Z'),
    });

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: null,
      rbtUserId: null,
    });
  });

  it('falls back to a real authenticated RBT when candidate cookies are invalid', async () => {
    setCandidateCookies(FORGED_CANDIDATE_ID, FINGERPRINT);
    mocks.findCandidateById.mockResolvedValue(
      candidate(FORGED_CANDIDATE_ID, 'HIRED', RBT_USER_ID)
    );
    mocks.getCurrentUser.mockResolvedValue({
      id: AUTHENTICATED_RBT_ID,
      role: 'RBT',
    });
    mocks.findCandidateByUser.mockResolvedValue({ id: CANDIDATE_ID });

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: CANDIDATE_ID,
      rbtUserId: AUTHENTICATED_RBT_ID,
    });
  });
});

describe.sequential('resolveActingRbtContext DevTools gate', () => {
  it('does not map a mock RBT identity when DevTools is disabled', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'mock-user-id',
      role: 'RBT',
    });

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: null,
      rbtUserId: null,
    });
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it('maps a mock RBT identity only when DevTools is explicitly enabled', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'mock-user-id',
      role: 'RBT',
    });
    mocks.isDevToolsEnabled.mockReturnValue(true);
    mocks.findUser.mockResolvedValue({ id: RBT_USER_ID });
    mocks.findCandidateByUser.mockResolvedValue({ id: CANDIDATE_ID });

    await expect(resolveActingRbtContext()).resolves.toEqual({
      candidateId: CANDIDATE_ID,
      rbtUserId: RBT_USER_ID,
    });
  });
});
