import { beforeEach, describe, expect, it, vi } from 'vitest';

const PA_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    pARequest: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    client: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth-guard')>();
  return { ...original, requireStaff: mocks.requireStaff };
});
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  approvePaRequest,
  approveTreatmentPaRequest,
  completeVobAndCreds,
  submitTreatmentPaRequest,
} from './billing';

const validApproval = {
  authNumber: 'AUTH-101',
  approvedUnits: 120,
  effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
  expirationDate: new Date('2027-03-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '33333333-3333-4333-8333-333333333333', role: 'BILLING', isActive: true },
  });
  mocks.prisma.client.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.pARequest.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma)
  );
});

describe('PA approval atomicity and validation', () => {
  it('rejects invalid units before reading the authorization record', async () => {
    const result = await approvePaRequest(PA_ID, { ...validApproval, approvedUnits: 1.5 });

    expect(result).toEqual({
      success: false,
      error: 'Approved units must be a positive whole number.',
    });
    expect(mocks.prisma.pARequest.findUnique).not.toHaveBeenCalled();
  });

  it('fails the Assessment PA transition when the client status changed', async () => {
    mocks.prisma.pARequest.findUnique.mockResolvedValue({
      id: PA_ID,
      clientId: CLIENT_ID,
      type: 'ASSESSMENT',
      status: 'SUBMITTED',
      client: { id: CLIENT_ID, status: 'PA_SUBMITTED' },
    });
    mocks.prisma.client.updateMany.mockResolvedValue({ count: 0 });

    const result = await approvePaRequest(PA_ID, validApproval);

    expect(result).toEqual({
      success: false,
      error: 'The PA or client status changed. Refresh and try again.',
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('binds Treatment PA approval to the reviewed PA and client states', async () => {
    mocks.prisma.pARequest.findUnique.mockResolvedValue({
      id: PA_ID,
      clientId: CLIENT_ID,
      type: 'TREATMENT',
      status: 'DENIED_CLINICAL',
      client: { id: CLIENT_ID, status: 'TX_PA_SUBMITTED' },
    });

    const result = await approveTreatmentPaRequest(PA_ID, validApproval);

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.client.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, status: 'TX_PA_SUBMITTED' },
      data: { status: 'STAFFING_PENDING' },
    });
    expect(mocks.prisma.pARequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: PA_ID,
        clientId: CLIENT_ID,
        type: 'TREATMENT',
        status: 'DENIED_CLINICAL',
      },
      data: { status: 'APPROVED', ...validApproval },
    });
  });

  it('does not downgrade an approved Treatment PA during resubmission', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      status: 'REPORT_ASSEMBLED',
      paRequests: [{
        id: PA_ID,
        type: 'TREATMENT',
        status: 'APPROVED',
        updatedAt: new Date('2026-09-05T18:00:00.000Z'),
      }],
    });

    const result = await submitTreatmentPaRequest(CLIENT_ID);

    expect(result).toEqual({
      success: false,
      error: 'Treatment PA cannot be submitted from APPROVED.',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back VOB completion when the reviewed client state is stale', async () => {
    const updatedAt = new Date('2026-09-05T18:00:00.000Z');
    mocks.prisma.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      status: 'CLINICAL_REVIEW_APPROVED',
      paRequests: [{ id: PA_ID, type: 'ASSESSMENT', updatedAt }],
    });
    mocks.prisma.client.updateMany.mockResolvedValue({ count: 0 });

    const result = await completeVobAndCreds(CLIENT_ID);

    expect(result).toEqual({
      success: false,
      error: 'The PA or client status changed. Refresh and try again.',
    });
    expect(mocks.prisma.pARequest.updateMany).not.toHaveBeenCalled();
  });
});
