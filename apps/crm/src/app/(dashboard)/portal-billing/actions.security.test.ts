import { beforeEach, describe, expect, it, vi } from 'vitest';

const PA_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = new Date('2026-09-05T18:00:00.000Z');

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  denyPaRequest: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    pARequest: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth-guard')>();
  return { ...original, requireStaff: mocks.requireStaff };
});
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/app/actions/notifications', () => ({ notifyUsers: vi.fn() }));
vi.mock('@/lib/intakeWorkflowNotifications', () => ({
  notifyAssessmentPaDecisionHandoff: vi.fn(),
}));
vi.mock('@/app/(dashboard)/portal-case/actions/billing', () => ({
  approvePaRequest: vi.fn(),
  approveTreatmentPaRequest: vi.fn(),
  completeVobAndCreds: vi.fn(),
  denyPaRequest: mocks.denyPaRequest,
  submitPaRequest: vi.fn(),
  submitTreatmentPaRequest: vi.fn(),
}));

import { recordPaApproval, recordPaDenial, resolvePaP2p } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '33333333-3333-4333-8333-333333333333', role: 'BILLING', isActive: true },
  });
  mocks.denyPaRequest.mockResolvedValue({ success: true });
  mocks.prisma.pARequest.updateMany.mockResolvedValue({ count: 1 });
});

describe('billing portal wrapper integrity', () => {
  it('does not silently truncate fractional approved units', async () => {
    const result = await recordPaApproval(PA_ID, {
      authNumber: 'AUTH-1',
      approvedUnits: 1.5,
      effectiveDate: '2026-09-01',
      expirationDate: '2027-03-01',
    });

    expect(result).toEqual({
      success: false,
      error: 'Approved units must be a positive whole number.',
    });
    expect(mocks.prisma.pARequest.findUnique).not.toHaveBeenCalled();
  });

  it('passes the required denial reason into the canonical conditional update', async () => {
    mocks.prisma.pARequest.findUnique.mockResolvedValue({
      type: 'ASSESSMENT',
      status: 'SUBMITTED',
      clientId: CLIENT_ID,
      client: { firstName: 'Ada', lastName: 'Client', caseCoordinatorId: null },
    });

    await recordPaDenial(PA_ID, { isClinical: true, reason: '  Medical necessity  ' });

    expect(mocks.denyPaRequest).toHaveBeenCalledWith(PA_ID, true, 'Medical necessity');
    expect(mocks.prisma.pARequest.updateMany).not.toHaveBeenCalled();
  });

  it('uses a version-bound update for P2P resolution', async () => {
    mocks.prisma.pARequest.findUnique.mockResolvedValue({
      status: 'DENIED_CLINICAL',
      clientId: CLIENT_ID,
      updatedAt: UPDATED_AT,
      p2pResolved: false,
    });
    mocks.prisma.pARequest.updateMany.mockResolvedValue({ count: 0 });

    const result = await resolvePaP2p(PA_ID, 'Payer review completed.');

    expect(result).toEqual({
      success: false,
      error: 'The PA changed in another session. Refresh and try again.',
    });
  });
});
