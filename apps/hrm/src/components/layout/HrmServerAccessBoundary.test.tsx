import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/',
  requireStaff: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === 'x-ras-pathname' ? mocks.pathname : null),
  })),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth-guard', () => ({ requireStaff: mocks.requireStaff }));

import { HrmServerAccessBoundary } from './HrmServerAccessBoundary';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = '/';
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: 'user-id', role: 'HR', isActive: true },
  });
});

describe('HrmServerAccessBoundary', () => {
  it('does not perform a staff lookup for public routes', async () => {
    await expect(HrmServerAccessBoundary({ children: 'public' })).resolves.toBe('public');
    expect(mocks.requireStaff).not.toHaveBeenCalled();
  });

  it('allows an active persisted staff session on protected routes', async () => {
    mocks.pathname = '/ats';

    await expect(HrmServerAccessBoundary({ children: 'private' })).resolves.toBe('private');
    expect(mocks.requireStaff).toHaveBeenCalledOnce();
  });

  it('redirects an inactive or missing staff session before rendering children', async () => {
    mocks.pathname = '/hr-dashboard';
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Not authenticated.' });

    await expect(HrmServerAccessBoundary({ children: 'private' })).rejects.toThrow(
      'REDIRECT:/login?error=inactive_or_unauthorized'
    );
  });
});
