import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

import { requireRole, requireStaff } from '../auth-guard';

const inactiveHeadHr = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'inactive@example.test',
  firstName: 'Inactive',
  lastName: 'Staff',
  role: 'HEAD_HR',
  isActive: false,
  createdAt: new Date('2026-08-12T12:00:00.000Z'),
  updatedAt: new Date('2026-08-12T12:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(inactiveHeadHr);
});

describe('HRM active-user authorization', () => {
  it('rejects an inactive authenticated user from the non-throwing staff gate', async () => {
    await expect(requireStaff(['HEAD_HR'])).resolves.toEqual({
      ok: false,
      error: 'Not authenticated. Please sign in.',
    });
  });

  it('rejects an inactive authenticated user from the throwing role gate', async () => {
    await expect(requireRole(['HEAD_HR'])).rejects.toThrow(
      'UNAUTHORIZED: Authentication required.',
    );
  });
});
