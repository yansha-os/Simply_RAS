import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveFingerprintValidCandidate: vi.fn(),
  cookieGet: vi.fn(),
}));

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

import { resolveHrmUiRole } from './resolveHrmRole';

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

describe('HRM UI role device-session security', () => {
  it('does not grant applicant or RBT chrome from raw cookies', async () => {
    const result = await resolveHrmUiRole();

    expect(result).toBe('NONE');
    expect(mocks.resolveFingerprintValidCandidate).toHaveBeenCalledWith(
      CANDIDATE_ID,
      FINGERPRINT
    );
  });

  it('maps a fingerprint-valid hired candidate to RBT', async () => {
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: CANDIDATE_ID,
      userId: '33333333-3333-4333-8333-333333333333',
      stage: 'HIRED',
      activationStatus: 'ACTIVE',
    });

    await expect(resolveHrmUiRole()).resolves.toBe('RBT');
  });
});
