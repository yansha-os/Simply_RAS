import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PACKET_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  prisma: {
    intakePacket: { findUnique: vi.fn(), updateMany: vi.fn() },
    client: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
  requireParentPacketAccess: vi.fn(),
  revalidatePath: vi.fn(),
  notifyRoles: vi.fn(),
  notifyClient: vi.fn(),
  notifyCaseTeam: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/magicLinkGuard', () => ({
  requireParentPacketAccess: mocks.requireParentPacketAccess,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/notificationDispatcher', () => ({
  notifyRoles: mocks.notifyRoles,
  notifyClient: mocks.notifyClient,
  notifyCaseTeam: mocks.notifyCaseTeam,
}));

import { submitMagicLinkPacket } from '../actions';

const uploaded = (path: string) => ({
  url: `/api/documents?path=${path}`,
  name: path,
  type: 'application/pdf',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireParentPacketAccess.mockResolvedValue({
    ok: true,
    packetId: PACKET_ID,
    clientId: CLIENT_ID,
  });
  mocks.notifyRoles.mockResolvedValue(undefined);
  mocks.notifyClient.mockResolvedValue(undefined);
  mocks.notifyCaseTeam.mockResolvedValue(undefined);
  mocks.prisma.intakePacket.updateMany.mockResolvedValue({ count: 1 });
});

describe('submitMagicLinkPacket clinical correction', () => {
  it('succeeds when CSS flagged one doc and the parent re-uploads that form key', async () => {
    mocks.prisma.intakePacket.findUnique.mockResolvedValue({
      id: PACKET_ID,
      clientId: CLIENT_ID,
      status: 'APPROVED',
      formData: {
        hasMedicaid: 'No',
        docInsuranceFront: uploaded('front.pdf'),
        docInsuranceBack: uploaded('back.pdf'),
        docEval: uploaded('eval.pdf'),
      },
      rejectionDetails: {
        physicianRxUploaded: '[Clinical Review] Missing signature.',
      },
    });
    mocks.prisma.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      status: 'DOCS_APPROVED_INTAKE',
      firstName: 'Ada',
      lastName: 'Client',
    });

    const result = await submitMagicLinkPacket(PACKET_ID, {
      docReferral: uploaded('referral-v2.pdf'),
    });

    expect(result).toEqual({ success: true });
    expect(mocks.requireParentPacketAccess).toHaveBeenCalledWith({
      packetId: PACKET_ID,
    });
    expect(mocks.prisma.intakePacket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: PACKET_ID,
          clientId: CLIENT_ID,
          status: { in: ['APPROVED', 'PENDING_CLIENT_SUBMISSION'] },
        },
        data: expect.objectContaining({
          status: 'APPROVED',
          physicianRxUploaded: true,
        }),
      }),
    );
    const updateData = mocks.prisma.intakePacket.updateMany.mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(updateData.rejectionDetails).toBeUndefined();
    expect(updateData.intakeFormComplete).toBeUndefined();
    expect(mocks.notifyRoles).toHaveBeenCalledWith(
      ['CLINICAL_SUPPORT'],
      expect.objectContaining({
        type: 'INFO',
      }),
    );
    expect(mocks.notifyCaseTeam).not.toHaveBeenCalled();
  });

  it('rejects a packet whose client does not match the authorized guard scope', async () => {
    mocks.prisma.intakePacket.findUnique.mockResolvedValue({
      id: PACKET_ID,
      clientId: '44444444-4444-4444-8444-444444444444',
      status: 'PENDING_CLIENT_SUBMISSION',
      formData: {},
      rejectionDetails: {},
    });

    await expect(submitMagicLinkPacket(PACKET_ID, {})).resolves.toEqual({
      success: false,
      error: 'Intake packet not found.',
    });
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.intakePacket.updateMany).not.toHaveBeenCalled();
  });

  it('rejects CSS resubmit when the flagged document is still missing', async () => {
    mocks.prisma.intakePacket.findUnique.mockResolvedValue({
      id: PACKET_ID,
      clientId: CLIENT_ID,
      status: 'APPROVED',
      formData: { hasMedicaid: 'No' },
      rejectionDetails: {
        physicianRxUploaded: '[Clinical Review] Missing signature.',
      },
    });
    mocks.prisma.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      status: 'DOCS_APPROVED_INTAKE',
      firstName: 'Ada',
      lastName: 'Client',
    });

    await expect(submitMagicLinkPacket(PACKET_ID, {})).resolves.toMatchObject({
      success: false,
      missingDocs: ['docReferral'],
    });
    expect(mocks.prisma.intakePacket.updateMany).not.toHaveBeenCalled();
  });
});
