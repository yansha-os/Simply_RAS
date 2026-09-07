import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PLAN = { status: 'COMPLETED', parentSignature: 'Parent Name' };
const BCBA_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => {
  const tx = {
    client: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    pARequest: { findFirst: vi.fn() },
    session: { findFirst: vi.fn(), create: vi.fn() },
    auditLogVault: { create: vi.fn() },
  };
  return {
    tx,
    requireStaff: vi.fn(),
    requireClientAccess: vi.fn(),
    revalidatePath: vi.fn(),
    prisma: {
      client: { findUnique: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/auth-guard', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth-guard')>();
  return {
    ...original,
    requireStaff: mocks.requireStaff,
    requireClientAccess: mocks.requireClientAccess,
  };
});
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/lib/intakeWorkflowNotifications', () => ({
  notifyAssessmentScheduledHandoff: vi.fn(),
}));

import { assembleReport, scheduleAssessment } from './clinical-support';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '22222222-2222-4222-8222-222222222222', role: 'BCBA', isActive: true },
  });
  mocks.requireClientAccess.mockResolvedValue({
    ok: false,
    error: 'You are not assigned to this client.',
  });
  mocks.prisma.client.findUnique.mockResolvedValue({
    id: CLIENT_ID,
    status: 'ASSESSMENT_SCHEDULED',
    treatmentPlan: PLAN,
  });
  mocks.prisma.client.updateMany.mockResolvedValue({ count: 1 });
});

describe('assembleReport authorization and concurrency', () => {
  it('denies an unassigned BCBA before loading the treatment plan', async () => {
    const result = await assembleReport(CLIENT_ID);

    expect(result).toEqual({
      success: false,
      error: 'You are not assigned to this client.',
    });
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.client.updateMany).not.toHaveBeenCalled();
  });

  it('does not assemble a report after the reviewed plan changes', async () => {
    mocks.requireClientAccess.mockResolvedValue({ ok: true });
    mocks.prisma.client.updateMany.mockResolvedValue({ count: 0 });

    const result = await assembleReport(CLIENT_ID);

    expect(result).toEqual({
      success: false,
      error: 'The treatment plan or client status changed. Refresh and try again.',
    });
    expect(mocks.prisma.client.updateMany).toHaveBeenCalledWith({
      where: {
        id: CLIENT_ID,
        status: 'ASSESSMENT_SCHEDULED',
        treatmentPlan: { equals: PLAN },
      },
      data: { status: 'REPORT_ASSEMBLED' },
    });
  });
});

describe('assessment scheduling evidence gates', () => {
  beforeEach(() => {
    mocks.requireClientAccess.mockResolvedValue({ ok: true });
    mocks.tx.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      status: 'PA_APPROVED',
      bcbaId: BCBA_ID,
      caseCoordinatorId: null,
      treatmentPlan: {},
      firstName: 'Test',
      lastName: 'Client',
    });
    mocks.tx.user.findUnique.mockResolvedValue({
      id: BCBA_ID,
      role: 'BCBA',
      isActive: true,
      firstName: 'BCBA',
      lastName: 'User',
      credentials: [{
        credentialType: 'BACB_LICENSE',
        isCredentialed: true,
        expirationDate: new Date('2099-01-01T00:00:00.000Z'),
      }],
    });
  });

  it('blocks scheduling when status exists without complete approved PA evidence', async () => {
    mocks.tx.pARequest.findFirst.mockResolvedValue(null);

    const result = await scheduleAssessment({
      clientId: CLIENT_ID,
      date: '2026-09-10T10:00',
      expectedClientStatus: 'PA_APPROVED',
      expectedBcbaId: BCBA_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('complete approved PA');
    expect(mocks.tx.session.create).not.toHaveBeenCalled();
  });

  it('blocks an appointment outside the approved PA effective window', async () => {
    mocks.tx.pARequest.findFirst.mockResolvedValue({
      authNumber: 'AUTH-97151',
      approvedUnits: 32,
      effectiveDate: new Date('2026-09-15T00:00:00.000Z'),
      expirationDate: new Date('2026-09-30T00:00:00.000Z'),
    });

    const result = await scheduleAssessment({
      clientId: CLIENT_ID,
      date: '2026-09-10T10:00',
      expectedClientStatus: 'PA_APPROVED',
      expectedBcbaId: BCBA_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('effective window');
    expect(mocks.tx.session.create).not.toHaveBeenCalled();
  });
});
