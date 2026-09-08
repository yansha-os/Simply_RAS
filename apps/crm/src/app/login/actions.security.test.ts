import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  cookieDelete: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signOut: mocks.signOut,
    },
  })),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/loginRateLimit', () => ({
  loginRateLimitKey: vi.fn(() => 'key'),
  isLoginRateLimited: vi.fn(() => false),
  recordLoginAttempt: vi.fn(),
  clearLoginAttempts: vi.fn(),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => '203.0.113.10') })),
  cookies: vi.fn(async () => ({ delete: mocks.cookieDelete })),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { logout } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('logout session revocation', () => {
  it('revokes the local Supabase session and clears dev bypass cookies', async () => {
    await expect(logout()).resolves.toEqual({ success: true });

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.cookieDelete).toHaveBeenCalledWith('dev_impersonate_user_id');
    expect(mocks.cookieDelete).toHaveBeenCalledWith('dev_impersonate_role');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('does not claim success when Supabase rejects sign-out', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('network') });

    await expect(logout()).resolves.toMatchObject({ success: false });
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
  });
});
