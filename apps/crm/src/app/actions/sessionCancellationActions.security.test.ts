import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = new Date('2026-09-05T12:00:00.000Z');

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  requireStaff: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    session: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
  requireStaff: mocks.requireStaff,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { logSessionCancellation } from './sessionCancellationActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ ok: true });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
  mocks.prisma.session.findUnique.mockResolvedValue({
    id: SESSION_ID,
    clientId: CLIENT_ID,
    status: 'SCHEDULED',
    updatedAt: UPDATED_AT,
  });
  mocks.prisma.session.updateMany.mockResolvedValue({ count: 1 });
});

describe('session cancellation write integrity', () => {
  it('rejects cancellation of a completed session', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      clientId: CLIENT_ID,
      status: 'COMPLETED',
      updatedAt: UPDATED_AT,
    });

    const result = await logSessionCancellation(SESSION_ID, {
      status: 'CANCELLED',
      reasonCategory: 'CLIENT_ILLNESS',
    });

    expect(result.success).toBe(false);
    expect(mocks.prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('uses compare-and-set and does not fabricate make-up eligibility', async () => {
    const result = await logSessionCancellation(SESSION_ID, {
      status: 'NO_SHOW',
      reasonCategory: 'UNEXCUSED_NO_SHOW',
      reasonNotes: ' Family did not arrive. ',
    });

    expect(mocks.prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: SESSION_ID,
        clientId: CLIENT_ID,
        status: 'SCHEDULED',
        updatedAt: UPDATED_AT,
      },
      data: {
        status: 'NO_SHOW',
        location: '[UNEXCUSED_NO_SHOW] Family did not arrive.',
      },
    });
    expect(result.success).toBe(true);
    expect(result).not.toHaveProperty('makeUpEligibility');
    expect(result.makeUpEligibilityUnavailableReason).toContain('payer-specific');
  });

  it('reports a concurrent update instead of overwriting it', async () => {
    mocks.prisma.session.updateMany.mockResolvedValue({ count: 0 });

    const result = await logSessionCancellation(SESSION_ID, {
      status: 'CANCELLED',
      reasonCategory: 'WEATHER_EMERGENCY',
    });

    expect(result).toEqual({
      success: false,
      error: 'Session changed before cancellation was saved. Refresh and try again.',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
