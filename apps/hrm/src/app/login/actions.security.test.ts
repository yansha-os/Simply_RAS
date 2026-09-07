import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  findUnique: vi.fn(),
  recordLoginAttempt: vi.fn(),
  isLoginRateLimited: vi.fn(() => false),
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
vi.mock('@/lib/loginRateLimit', () => ({
  loginRateLimitKey: vi.fn(() => 'key'),
  isLoginRateLimited: mocks.isLoginRateLimited,
  recordLoginAttempt: mocks.recordLoginAttempt,
  clearLoginAttempts: vi.fn(),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => '203.0.113.10') })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { login } from './actions';

beforeEach(() => vi.clearAllMocks());

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
