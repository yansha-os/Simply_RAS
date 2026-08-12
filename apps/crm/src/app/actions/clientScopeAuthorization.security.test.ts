import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const BCBA_ID = '22222222-2222-4222-8222-222222222222';
const PACKET_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ACCESS_ERROR = 'You are not assigned to this client.';
const PARENT_GATE_ERROR =
  'This portal is locked to the device that first opened the link. Please use your original device or request a new link.';

const mocks = vi.hoisted(() => ({
  prisma: {
    session: { findMany: vi.fn() },
    client: { findUnique: vi.fn(), update: vi.fn() },
    skillTarget: { create: vi.fn(), update: vi.fn() },
    behaviorTarget: { create: vi.fn(), update: vi.fn() },
    intakePacket: { findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
  },
  getCurrentUser: vi.fn(),
  requireClientAccess: vi.fn(),
  requireStaffOrParent: vi.fn(),
  requireParentPacketAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
}));
vi.mock('@/lib/magicLinkGuard', () => ({
  requireStaffOrParent: mocks.requireStaffOrParent,
  requireParentPacketAccess: mocks.requireParentPacketAccess,
}));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/app/actions/notifications', () => ({
  notifyUsers: mocks.notifyUsers,
}));

import { getClientSessionHistory } from './clientSessionHistoryActions';
import { syncTreatmentPlanTargetsToSessionStudio } from './clinicalGoalsActions';
import { signTreatmentPlan } from './intake';

function activeBcba() {
  return {
    id: BCBA_ID,
    email: 'bcba@example.test',
    firstName: 'Bailey',
    lastName: 'Analyst',
    role: 'BCBA',
    isActive: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(activeBcba());
  mocks.requireClientAccess.mockResolvedValue({
    ok: false,
    error: CLIENT_ACCESS_ERROR,
  });
  mocks.requireStaffOrParent.mockResolvedValue({
    ok: true,
    via: 'staff',
    user: activeBcba(),
  });
  mocks.requireParentPacketAccess.mockResolvedValue({
    ok: false,
    error: PARENT_GATE_ERROR,
  });
  mocks.prisma.session.findMany.mockResolvedValue([]);
  mocks.prisma.client.findUnique.mockResolvedValue(null);
  mocks.prisma.client.update.mockResolvedValue({});
  mocks.prisma.user.findMany.mockResolvedValue([]);
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

describe('client-scoped clinical action authorization', () => {
  it('denies an unassigned session-history read before querying sessions', async () => {
    const result = await getClientSessionHistory(CLIENT_ID);

    expect(result).toEqual({
      success: false,
      error: CLIENT_ACCESS_ERROR,
    });
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(CLIENT_ID);
    expect(mocks.prisma.session.findMany).not.toHaveBeenCalled();
  });

  it('denies an unassigned target sync before reading or mutating client data', async () => {
    const result = await syncTreatmentPlanTargetsToSessionStudio(CLIENT_ID);

    expect(result).toEqual({
      success: false,
      error: CLIENT_ACCESS_ERROR,
    });
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(CLIENT_ID);
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.skillTarget.create).not.toHaveBeenCalled();
    expect(mocks.prisma.skillTarget.update).not.toHaveBeenCalled();
    expect(mocks.prisma.behaviorTarget.create).not.toHaveBeenCalled();
    expect(mocks.prisma.behaviorTarget.update).not.toHaveBeenCalled();
  });

  it('denies staff sessions on the parent typed-name treatment-plan signer', async () => {
    const result = await signTreatmentPlan(CLIENT_ID, 'Parent Name', { planReviewed: true });

    expect(result).toEqual({
      success: false,
      error: PARENT_GATE_ERROR,
    });
    expect(mocks.requireParentPacketAccess).toHaveBeenCalledWith({ clientId: CLIENT_ID });
    expect(mocks.requireClientAccess).not.toHaveBeenCalled();
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.client.update).not.toHaveBeenCalled();
  });

  it('preserves the packet-scoped parent treatment-plan signature path', async () => {
    mocks.requireParentPacketAccess.mockResolvedValue({
      ok: true,
      packetId: PACKET_ID,
      clientId: CLIENT_ID,
    });
    mocks.prisma.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      status: 'ASSESSMENT_SCHEDULED',
      guardianName: 'Parent Name',
      treatmentPlan: { status: 'COMPLETED' },
      intakePacket: {
        id: PACKET_ID,
        formData: { g1Name: 'Parent Name' },
        magicLinkToken: 'tok',
      },
    });

    const result = await signTreatmentPlan(CLIENT_ID, 'Parent Name', { planReviewed: true });

    expect(result).toEqual({ success: true, nameMatched: true });
    expect(mocks.requireClientAccess).not.toHaveBeenCalled();
    expect(mocks.prisma.client.update).toHaveBeenCalledTimes(1);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SIGN',
        entityType: 'TREATMENT_PLAN',
        entityId: CLIENT_ID,
      })
    );
  });
});
