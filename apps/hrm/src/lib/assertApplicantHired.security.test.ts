import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveFingerprintValidCandidate: vi.fn(),
  cookieGet: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/candidateDeviceSession', () => ({
  CANDIDATE_SESSION_COOKIE: 'ras_device_session_token',
  DEVICE_FINGERPRINT_COOKIE: 'device_fingerprint',
  resolveFingerprintValidCandidate: mocks.resolveFingerprintValidCandidate,
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { assertApplicantHired } from './assertApplicantHired';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.resolveFingerprintValidCandidate.mockResolvedValue(null);
  mocks.cookieGet.mockImplementation((name: string) => {
    if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
    if (name === 'device_fingerprint') return { value: FINGERPRINT };
    return undefined;
  });
});

describe('hired applicant route guard', () => {
  it('rejects a raw hired-candidate cookie when fingerprint validation fails', async () => {
    await expect(assertApplicantHired()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.resolveFingerprintValidCandidate).toHaveBeenCalledWith(
      CANDIDATE_ID,
      FINGERPRINT
    );
    expect(mocks.redirect).toHaveBeenCalledWith('/rbt');
  });

  it('allows a fingerprint-valid hired candidate', async () => {
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: CANDIDATE_ID,
      userId: '33333333-3333-4333-8333-333333333333',
      stage: 'HIRED',
      activationStatus: 'ACTIVE',
    });

    await expect(assertApplicantHired()).resolves.toBeUndefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
