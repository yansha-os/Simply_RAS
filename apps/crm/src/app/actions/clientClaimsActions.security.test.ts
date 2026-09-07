import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = new Date('2026-09-05T18:00:00.000Z');

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireClientAccess: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    sessionNote: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth-guard')>();
  return {
    ...original,
    requireStaff: mocks.requireStaff,
    requireClientAccess: mocks.requireClientAccess,
  };
});
vi.mock('@/lib/staffCredentials.server', () => ({ getCredentialStatus: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { updateClaimOutcome } from './clientClaimsActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '33333333-3333-4333-8333-333333333333', role: 'BILLING', isActive: true },
  });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
  mocks.prisma.sessionNote.findUnique.mockResolvedValue({
    id: NOTE_ID,
    isConverted: true,
    claimOutcome: null,
    updatedAt: UPDATED_AT,
    session: { clientId: CLIENT_ID },
  });
  mocks.prisma.sessionNote.updateMany.mockResolvedValue({ count: 1 });
});

describe('updateClaimOutcome concurrency', () => {
  it('rejects malformed note ids before reading claim data', async () => {
    const result = await updateClaimOutcome('bad-id', 'APPROVED');

    expect(result).toEqual({ success: false, error: 'Invalid claim outcome.' });
    expect(mocks.prisma.sessionNote.findUnique).not.toHaveBeenCalled();
  });

  it('uses the durable claim snapshot as an optimistic concurrency condition', async () => {
    mocks.prisma.sessionNote.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateClaimOutcome(NOTE_ID, 'DENIED_CLERICAL');

    expect(result).toEqual({
      success: false,
      error: 'The claim changed in another session. Refresh and try again.',
    });
    expect(mocks.prisma.sessionNote.updateMany).toHaveBeenCalledWith({
      where: {
        id: NOTE_ID,
        isConverted: true,
        claimOutcome: null,
        updatedAt: UPDATED_AT,
      },
      data: { claimOutcome: 'DENIED_CLERICAL' },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
