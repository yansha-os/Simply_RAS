import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PACKET_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_GATE_ERROR =
  'This portal is locked to the device that first opened the link. Please use your original device or request a new link.';

const mocks = vi.hoisted(() => ({
  prisma: {
    client: { findUnique: vi.fn(), update: vi.fn() },
  },
  requireParentPacketAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/magicLinkGuard', () => ({
  requireParentPacketAccess: mocks.requireParentPacketAccess,
  requireStaffOrParent: vi.fn(),
}));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/app/actions/notifications', () => ({
  notifyUsers: vi.fn(),
}));

import { signTreatmentPlan } from './intake';
import {
  buildParentPlanReviewSummary,
  resolveExpectedGuardianName,
  validateParentTreatmentPlanSign,
} from '@/lib/parentTreatmentPlanSign';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireParentPacketAccess.mockResolvedValue({
    ok: true,
    packetId: PACKET_ID,
    clientId: CLIENT_ID,
  });
  mocks.prisma.client.findUnique.mockResolvedValue({
    id: CLIENT_ID,
    status: 'ASSESSMENT_SCHEDULED',
    guardianName: 'Jane Parent',
    treatmentPlan: {
      status: 'COMPLETED',
      hours97153: 20,
      skillGoals: [{ domain: 'Communication', description: 'Request preferred items' }],
      crisisPlan: 'Call clinic if escalation continues.',
    },
    intakePacket: {
      id: PACKET_ID,
      formData: { g1Name: 'Jane Parent' },
      magicLinkToken: 'tok',
    },
  });
  mocks.prisma.client.update.mockResolvedValue({});
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

describe('validateParentTreatmentPlanSign', () => {
  it('blocks sign without plan review', () => {
    expect(
      validateParentTreatmentPlanSign({
        parentSignatureName: 'Jane Parent',
        planReviewed: false,
        expectedGuardianName: 'Jane Parent',
      })
    ).toMatchObject({ ok: false, code: 'NOT_REVIEWED' });
  });

  it('fails closed on empty typed name', () => {
    expect(
      validateParentTreatmentPlanSign({
        parentSignatureName: '   ',
        planReviewed: true,
        expectedGuardianName: 'Jane Parent',
      })
    ).toMatchObject({ ok: false, code: 'EMPTY_NAME' });
  });

  it('fails closed when no guardian name is on file', () => {
    expect(
      validateParentTreatmentPlanSign({
        parentSignatureName: 'Jane Parent',
        planReviewed: true,
        expectedGuardianName: null,
      })
    ).toMatchObject({ ok: false, code: 'NO_GUARDIAN' });
  });

  it('allows soft name mismatch with nameMatched false', () => {
    expect(
      validateParentTreatmentPlanSign({
        parentSignatureName: 'Different Name',
        planReviewed: true,
        expectedGuardianName: 'Jane Parent',
      })
    ).toEqual({
      ok: true,
      signatureName: 'Different Name',
      expectedGuardianName: 'Jane Parent',
      nameMatched: false,
    });
  });

  it('matches normalized guardian names', () => {
    expect(
      validateParentTreatmentPlanSign({
        parentSignatureName: '  jane   parent ',
        planReviewed: true,
        expectedGuardianName: 'Jane Parent',
      })
    ).toMatchObject({ ok: true, nameMatched: true });
  });
});

describe('resolveExpectedGuardianName / review summary', () => {
  it('prefers client.guardianName then formData.g1Name', () => {
    expect(
      resolveExpectedGuardianName({
        guardianName: 'On Client',
        formData: { g1Name: 'On Packet' },
      })
    ).toBe('On Client');
    expect(
      resolveExpectedGuardianName({
        guardianName: null,
        formData: { g1Name: 'On Packet' },
      })
    ).toBe('On Packet');
  });

  it('builds goals/crisis/hours from existing treatmentPlan JSON only', () => {
    const summary = buildParentPlanReviewSummary({
      hours97153: 10,
      hours97155: 2,
      hours97156: 1,
      primaryLocations: ['Home'],
      skillGoals: [{ domain: 'Social', description: 'Greet peers' }],
      parentGoals: [{ description: 'Practice prompts' }],
      brp: [{ behavior: 'Elopement' }],
      crisisPlan: 'Safety steps',
    });
    expect(summary.hours97153).toBe(10);
    expect(summary.crisisPlan).toBe('Safety steps');
    expect(summary.goals.map((g) => g.kind)).toEqual(['skill', 'caregiver', 'behavior']);
  });
});

describe('signTreatmentPlan parent hardening', () => {
  it('blocks parent sign without review evidence before any DB write', async () => {
    const result = await signTreatmentPlan(CLIENT_ID, 'Jane Parent', { planReviewed: false });

    expect(result).toMatchObject({
      success: false,
      code: 'NOT_REVIEWED',
    });
    expect(mocks.prisma.client.update).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it('blocks parent sign when options omit planReviewed', async () => {
    const result = await signTreatmentPlan(CLIENT_ID, 'Jane Parent');

    expect(result).toMatchObject({ success: false, code: 'NOT_REVIEWED' });
    expect(mocks.prisma.client.update).not.toHaveBeenCalled();
  });

  it('rejects staff sessions that lack parent packet access', async () => {
    mocks.requireParentPacketAccess.mockResolvedValue({
      ok: false,
      error: PARENT_GATE_ERROR,
    });

    const result = await signTreatmentPlan(CLIENT_ID, 'Jane Parent', { planReviewed: true });

    expect(result).toEqual({ success: false, error: PARENT_GATE_ERROR });
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.client.update).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it('fails closed on empty typed name', async () => {
    const result = await signTreatmentPlan(CLIENT_ID, '   ', { planReviewed: true });

    expect(result).toMatchObject({ success: false, code: 'EMPTY_NAME' });
    expect(mocks.prisma.client.update).not.toHaveBeenCalled();
  });

  it('fails closed when guardian name is missing on packet and client', async () => {
    mocks.prisma.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      status: 'ASSESSMENT_SCHEDULED',
      guardianName: null,
      treatmentPlan: { status: 'COMPLETED' },
      intakePacket: { id: PACKET_ID, formData: {}, magicLinkToken: 'tok' },
    });

    const result = await signTreatmentPlan(CLIENT_ID, 'Jane Parent', { planReviewed: true });

    expect(result).toMatchObject({ success: false, code: 'NO_GUARDIAN' });
    expect(mocks.prisma.client.update).not.toHaveBeenCalled();
  });

  it('writes SIGN audit with ids only and soft-mismatch warning', async () => {
    const result = await signTreatmentPlan(CLIENT_ID, 'Other Name', { planReviewed: true });

    expect(result).toMatchObject({
      success: true,
      nameMatched: false,
      warning: expect.stringContaining('does not match'),
    });
    expect(mocks.prisma.client.update).toHaveBeenCalledTimes(1);
    const updateArg = mocks.prisma.client.update.mock.calls[0][0];
    expect(updateArg.data.treatmentPlan.parentPlanReviewed).toBe(true);
    expect(updateArg.data.treatmentPlan.parentSignature).toBe('Other Name');

    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      action: 'SIGN',
      entityType: 'TREATMENT_PLAN',
      entityId: CLIENT_ID,
      meta: {
        event: 'PARENT_TREATMENT_PLAN_ESIGN',
        clientId: CLIENT_ID,
        packetId: PACKET_ID,
        nameMatched: false,
      },
    });
    const meta = mocks.writeAuditLog.mock.calls[0][0].meta;
    expect(JSON.stringify(meta)).not.toMatch(/Other Name|Jane Parent/i);
  });

  it('succeeds with matched name and audit row', async () => {
    const result = await signTreatmentPlan(CLIENT_ID, 'Jane Parent', { planReviewed: true });

    expect(result).toEqual({ success: true, nameMatched: true });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SIGN',
        entityType: 'TREATMENT_PLAN',
        entityId: CLIENT_ID,
        meta: expect.objectContaining({ nameMatched: true, packetId: PACKET_ID }),
      })
    );
  });
});
