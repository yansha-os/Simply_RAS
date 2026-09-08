import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  findUnique: vi.fn(),
  recordLoginAttempt: vi.fn(),
  isLoginRateLimited: vi.fn(() => false),
  cookieDelete: vi.fn(),
  clearApplicantDeviceSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  })),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/app/actions/applicantSessionActions', () => ({
  clearApplicantDeviceSession: mocks.clearApplicantDeviceSession,
}));
vi.mock('@/lib/loginRateLimit', () => ({
  loginRateLimitKey: vi.fn(() => 'key'),
  isLoginRateLimited: mocks.isLoginRateLimited,
  recordLoginAttempt: mocks.recordLoginAttempt,
  clearLoginAttempts: vi.fn(),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => '203.0.113.10') })),
  cookies: vi.fn(async () => ({ delete: mocks.cookieDelete })),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { login, logout } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearApplicantDeviceSession.mockResolvedValue({ success: true });
  mocks.signOut.mockResolvedValue({ error: null });
});

function loginForm(email: string, password: string): FormData {
  const formData = new FormData();
  formData.set('email', email);
  formData.set('password', password);
  return formData;
}

describe('login input bounds', () => {
  it('rejects an oversized email before rate-limit or auth work', async () => {
    const result = await login(null, loginForm(`${'a'.repeat(250)}@x.com`, 'password'));

    expect(result).toEqual({ error: 'Invalid email or password.' });
    expect(mocks.recordLoginAttempt).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects an oversized password before rate-limit or auth work', async () => {
    const result = await login(null, loginForm('staff@example.com', 'x'.repeat(1_025)));

    expect(result).toEqual({ error: 'Invalid email or password.' });
    expect(mocks.recordLoginAttempt).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('logout session revocation', () => {
  it('revokes the applicant device, Supabase session, and dev bypass cookies', async () => {
    await expect(logout()).resolves.toEqual({ success: true });

    expect(mocks.clearApplicantDeviceSession).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.cookieDelete).toHaveBeenCalledWith('dev_impersonate_user_id');
    expect(mocks.cookieDelete).toHaveBeenCalledWith('dev_impersonate_role');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('does not discard the Supabase session when device revocation fails', async () => {
    mocks.clearApplicantDeviceSession.mockResolvedValue({ success: false });

    await expect(logout()).resolves.toMatchObject({ success: false });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
