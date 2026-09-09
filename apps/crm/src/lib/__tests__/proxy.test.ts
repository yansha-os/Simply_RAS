import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mocks.getUser,
      mfa: { getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel },
    },
  })),
}));

import { proxy } from '../../proxy';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'false');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'unit-test-anon-key');
});

afterEach(() => vi.unstubAllEnvs());

describe('CRM proxy MFA enforcement', () => {
  it('redirects an enrolled AAL1 session to the MFA challenge', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });

    const response = await proxy(new NextRequest('https://crm.example.test/ops'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://crm.example.test/mfa?next=%2Fops');
  });

  it('allows an unenrolled AAL1 session through', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    });

    const response = await proxy(new NextRequest('https://crm.example.test/ops'));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects unauthenticated access to the challenge page', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(new NextRequest('https://crm.example.test/mfa'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://crm.example.test/login');
  });
});
