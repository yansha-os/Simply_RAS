import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FORGED_CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const RBT_USER_ID = '33333333-3333-4333-8333-333333333333';
const FINGERPRINT = '44444444-4444-4444-8444-444444444444';
const OTHER_FINGERPRINT = '55555555-5555-4555-8555-555555555555';

const mocks = vi.hoisted(() => ({
  findDeviceSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    applicantDeviceSession: {
      findUnique: mocks.findDeviceSession,
    },
  },
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mocks.getUser,
    },
  })),
}));

import { proxy } from '../../proxy';

const REFERRER_POLICY = 'no-referrer';
const ROBOTS_POLICY = 'noindex, nofollow';

function activeDeviceSession() {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    candidateId: CANDIDATE_ID,
    revokedAt: null,
    boundAt: new Date(),
    candidate: {
      id: CANDIDATE_ID,
      userId: RBT_USER_ID,
      stage: 'HIRED',
      activationStatus: 'ACTIVE',
    },
  };
}

function applicantRequest(
  candidateId: string | null = CANDIDATE_ID,
  fingerprint: string | null = FINGERPRINT
) {
  const cookieParts = [
    candidateId ? `ras_device_session_token=${candidateId}` : null,
    fingerprint ? `device_fingerprint=${fingerprint}` : null,
  ].filter(Boolean);

  return new NextRequest('https://hrm.example.test/rbt/schedule', {
    headers: cookieParts.length ? { cookie: cookieParts.join('; ') } : undefined,
  });
}

function expectApplyRedirect(response: Response) {
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(
    'https://hrm.example.test/apply'
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'false');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  mocks.getUser.mockResolvedValue({ data: { user: null } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function expectMagicLinkResponseHeaders(response: Response, token: string) {
  expect(response.headers.get('referrer-policy')).toBe(REFERRER_POLICY);
  expect(response.headers.get('x-robots-tag')).toBe(ROBOTS_POLICY);

  const responseHeaders = JSON.stringify(Array.from(response.headers.entries()));
  expect(responseHeaders).not.toContain(token);
}

describe.sequential('HRM magic-link proxy responses', () => {
  it('hardens pass-through responses without exposing the token', async () => {
    const token = 'unit-test-magic-link-token';
    const fingerprint = '00000000-0000-4000-8000-000000000001';
    const request = new NextRequest(
      `https://hrm.example.test/magic-link/${token}`,
      {
        headers: {
          cookie: `device_fingerprint=${fingerprint}`,
        },
      }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(
      response.headers.get('x-middleware-request-x-device-fingerprint')
    ).toBe(fingerprint);
    expect(response.cookies.get('device_fingerprint')?.value).toBe(fingerprint);
    expectMagicLinkResponseHeaders(response, token);
  });

  it('hardens malformed-token redirects without exposing the token', async () => {
    const token = 'unit-test-invalid-token!';
    const request = new NextRequest(
      `https://hrm.example.test/magic-link/${token}`
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://hrm.example.test/apply'
    );
    expectMagicLinkResponseHeaders(response, token);
  });
});

describe.sequential('HRM applicant proxy device-session security', () => {
  it('allows a fingerprint-matched active candidate device session', async () => {
    mocks.findDeviceSession.mockResolvedValue(activeDeviceSession());

    const response = await proxy(applicantRequest());

    expect(response.headers.get('x-middleware-next')).toBe('1');
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
  });

  it('rejects a persisted device session for a still-pending applicant', async () => {
    mocks.findDeviceSession.mockResolvedValue({
      ...activeDeviceSession(),
      candidate: {
        id: CANDIDATE_ID,
        userId: null,
        stage: 'APPLIED',
        activationStatus: 'PENDING_HR_REVIEW',
      },
    });

    const response = await proxy(applicantRequest());

    expectApplyRedirect(response);
  });

  it('rejects a forged candidate cookie with no persisted device session', async () => {
    mocks.findDeviceSession.mockResolvedValue(null);

    const response = await proxy(
      applicantRequest(FORGED_CANDIDATE_ID, FINGERPRINT)
    );

    expectApplyRedirect(response);
  });

  it('rejects a candidate cookie when the fingerprint cookie is missing', async () => {
    const response = await proxy(applicantRequest(CANDIDATE_ID, null));

    expectApplyRedirect(response);
    expect(mocks.findDeviceSession).not.toHaveBeenCalled();
  });

  it('rejects a candidate cookie with a mismatched fingerprint', async () => {
    mocks.findDeviceSession.mockResolvedValue(null);

    const response = await proxy(
      applicantRequest(CANDIDATE_ID, OTHER_FINGERPRINT)
    );

    expectApplyRedirect(response);
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
    mocks.findDeviceSession.mockResolvedValue({
      ...activeDeviceSession(),
      revokedAt: new Date('2026-08-12T08:00:00.000Z'),
    });

    const response = await proxy(applicantRequest());

    expectApplyRedirect(response);
  });

  it('rejects a mismatched fingerprint when Supabase auth is configured but absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'unit-test-anon-key');
    mocks.findDeviceSession.mockResolvedValue(null);

    const response = await proxy(
      applicantRequest(CANDIDATE_ID, OTHER_FINGERPRINT)
    );

    expectApplyRedirect(response);
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });

  it('rejects an unverified applicant in development when DevTools is off', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = await proxy(applicantRequest(null, null));

    expectApplyRedirect(response);
  });

  it('allows the explicit non-production DevTools bypass', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'true');

    const response = await proxy(applicantRequest(null, null));

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.findDeviceSession).not.toHaveBeenCalled();
  });

  it('does not honor the DevTools flag in production', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'true');

    const response = await proxy(applicantRequest(null, null));

    expectApplyRedirect(response);
  });
});

describe.sequential('HRM staff proxy dev-tools impersonation bypass', () => {
  it('redirects unauthenticated staff route to /login when DevTools are disabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'false');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'unit-test-anon-key');

    const request = new NextRequest('https://hrm.example.test/ats', {
      headers: { cookie: 'dev_impersonate_role=HR_AGENT' },
    });

    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://hrm.example.test/login?next=%2Fats');
  });

  it('allows access to staff route when DevTools are enabled and role cookie is present', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'unit-test-anon-key');

    const request = new NextRequest('https://hrm.example.test/ats', {
      headers: { cookie: 'dev_impersonate_role=HR_AGENT' },
    });

    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-request-x-ras-pathname')).toBe('/ats');
  });

  it('allows access to staff route when DevTools are enabled and userId cookie is present', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'unit-test-anon-key');

    const request = new NextRequest('https://hrm.example.test/hr-dashboard', {
      headers: { cookie: 'dev_impersonate_user_id=edbd9e0c-b8cb-4206-b297-ff81dc4ade88' },
    });

    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('does not allow staff impersonation bypass in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'unit-test-anon-key');

    const request = new NextRequest('https://hrm.example.test/payroll', {
      headers: { cookie: 'dev_impersonate_role=FINANCE' },
    });

    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://hrm.example.test/login?next=%2Fpayroll');
  });
});
