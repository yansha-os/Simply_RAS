import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireClientAccess: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    client: { findUnique: vi.fn() },
    $transaction: vi.fn(),
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
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/app/(dashboard)/portal-case/actions/clinical-support', () => ({
  assembleReport: vi.fn(),
  scheduleAssessment: vi.fn(),
}));

import { submitTreatmentPacket } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '22222222-2222-4222-8222-222222222222', role: 'BCBA', isActive: true },
  });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
});

describe('submitTreatmentPacket status integrity', () => {
  it.each(['APPROVED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'])(
    'does not downgrade a %s Treatment PA to SUBMITTED',
    async (status) => {
      mocks.prisma.client.findUnique.mockResolvedValue({
        id: CLIENT_ID,
        status: 'REPORT_ASSEMBLED',
        paRequests: [{ id: '33333333-3333-4333-8333-333333333333', status }],
      });

      const result = await submitTreatmentPacket(CLIENT_ID);

      expect(result).toEqual({
        success: false,
        error: `Treatment PA is already ${status} and cannot be reset to SUBMITTED.`,
      });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    }
  );
});
