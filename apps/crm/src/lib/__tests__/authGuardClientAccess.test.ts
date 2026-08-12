import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { requireClientAccess } from '../auth-guard';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

function staff(role: string, id = 'staff-1') {
  return {
    id,
    email: `${id}@example.test`,
    firstName: 'Test',
    lastName: 'Staff',
    role,
    isActive: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireClientAccess authoritative client scope', () => {
  it('rejects a nonexistent client even for a global-access role', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('BILLING'));
    mocks.findUnique.mockResolvedValue(null);

    await expect(requireClientAccess(CLIENT_ID)).resolves.toEqual({
      ok: false,
      error: 'Client not found.',
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: CLIENT_ID },
      select: { bcbaId: true, rbtId: true, caseCoordinatorId: true },
    });
  });

  it('allows a global-access staff member only after the client exists', async () => {
    const user = staff('CASE_COORDINATOR');
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUnique.mockResolvedValue({
      bcbaId: null,
      rbtId: null,
      caseCoordinatorId: null,
    });

    const result = await requireClientAccess(CLIENT_ID);

    expect(result).toMatchObject({ ok: true, user: { id: user.id } });
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });

  it('allows assigned clinical staff and denies staff assigned elsewhere', async () => {
    const user = staff('BCBA', 'bcba-1');
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUnique
      .mockResolvedValueOnce({
        bcbaId: user.id,
        rbtId: null,
        caseCoordinatorId: null,
      })
      .mockResolvedValueOnce({
        bcbaId: 'different-bcba',
        rbtId: null,
        caseCoordinatorId: null,
      });

    await expect(requireClientAccess(CLIENT_ID)).resolves.toMatchObject({
      ok: true,
      user: { id: user.id },
    });
    await expect(requireClientAccess(CLIENT_ID)).resolves.toEqual({
      ok: false,
      error: 'You are not assigned to this client.',
    });
  });
});
