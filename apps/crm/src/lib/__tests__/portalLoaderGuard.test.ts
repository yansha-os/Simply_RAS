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

import {
  BILLING_ROLES,
  CASE_COORD_ROLES,
  CLINICAL_ROLES,
  INTAKE_ROLES,
  SESSION_NOTES_CONVERSION_ROLES,
  SESSION_NOTES_ROLES,
  requirePersistedStaff,
} from '../auth-guard';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';

function staff(role: string, overrides: Record<string, unknown> = {}) {
  return {
    id: STAFF_ID,
    email: 'staff@example.test',
    firstName: 'Test',
    lastName: 'Staff',
    role,
    isActive: true,
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requirePersistedStaff', () => {
  it.each([
    {
      portal: 'intake',
      roles: INTAKE_ROLES,
      expected: [
        'CEO',
        'CLINICAL_DIRECTOR',
        'OPS_DIRECTOR',
        'INTAKE_PA_COORDINATOR',
      ],
    },
    {
      portal: 'billing',
      roles: BILLING_ROLES,
      expected: [
        'CEO',
        'CLINICAL_DIRECTOR',
        'OPS_DIRECTOR',
        'BILLING',
        'FINANCE',
        'INTAKE_PA_COORDINATOR',
        'CLINICAL_SUPPORT',
      ],
    },
    {
      portal: 'case coordination',
      roles: CASE_COORD_ROLES,
      expected: [
        'CEO',
        'CLINICAL_DIRECTOR',
        'OPS_DIRECTOR',
        'CASE_COORDINATOR',
        'CLINICAL_SUPPORT',
      ],
    },
    {
      portal: 'session notes',
      roles: SESSION_NOTES_ROLES,
      expected: [
        'CEO',
        'CLINICAL_DIRECTOR',
        'OPS_DIRECTOR',
        'BILLING',
        'FINANCE',
        'SESSION_NOTES_COORDINATOR',
      ],
    },
    {
      portal: 'clinical',
      roles: CLINICAL_ROLES,
      expected: [
        'CEO',
        'CLINICAL_DIRECTOR',
        'OPS_DIRECTOR',
        'BCBA',
        'CLINICAL_SUPPORT',
      ],
    },
    {
      portal: 'session notes conversion',
      roles: SESSION_NOTES_CONVERSION_ROLES,
      expected: [
        'CEO',
        'CLINICAL_DIRECTOR',
        'OPS_DIRECTOR',
        'BILLING',
        'FINANCE',
        'SESSION_NOTES_COORDINATOR',
      ],
    },
  ])('enforces the canonical $portal role matrix', async ({ roles, expected }) => {
    expect(roles).toEqual(expected);

    for (const role of expected) {
      mocks.getCurrentUser.mockResolvedValueOnce(staff(role));
      await expect(requirePersistedStaff(roles)).resolves.toMatchObject({
        ok: true,
        user: { id: STAFF_ID, role },
      });
    }
  });

  it.each([
    ['missing user', null],
    ['inactive user', staff('BCBA', { isActive: false })],
    ['synthetic dev role', staff('BCBA', { id: 'mock-user-id' })],
    ['malformed actor id', staff('BCBA', { id: 'not-a-uuid' })],
    ['malformed active flag', staff('BCBA', { isActive: undefined })],
    ['wrong role', staff('BILLING')],
  ])('fails closed for a %s', async (_label, actor) => {
    mocks.getCurrentUser.mockResolvedValue(actor);

    await expect(requirePersistedStaff(CLINICAL_ROLES)).resolves.toEqual({
      ok: false,
      error: 'Not found.',
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
