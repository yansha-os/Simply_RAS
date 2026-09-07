import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PACKET_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = new Date('2026-09-05T18:00:00.000Z');

const mocks = vi.hoisted(() => ({
  requireStaffOrParent: vi.fn(),
  requireParentPacketAccess: vi.fn(),
  requireClientAccess: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    intakePacket: { findUnique: vi.fn(), updateMany: vi.fn() },
    client: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/magicLinkGuard', () => ({
  requireStaffOrParent: mocks.requireStaffOrParent,
  requireParentPacketAccess: mocks.requireParentPacketAccess,
}));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
}));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/app/actions/notifications', () => ({ notifyUsers: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  requestClientChanges,
  saveClientSchedule,
  saveIntakeProgress,
  submitForm01,
} from './intake';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClientAccess.mockResolvedValue({
    ok: false,
    error: 'You are not assigned to this client.',
  });
  mocks.prisma.intakePacket.findUnique.mockResolvedValue({
    clientId: CLIENT_ID,
    status: 'PENDING_CLIENT_SUBMISSION',
    updatedAt: UPDATED_AT,
    formData: {},
    rejectionDetails: {},
  });
});

describe('shared intake action authorization', () => {
  it('denies staff autosave without access to the packet client', async () => {
    mocks.requireStaffOrParent.mockResolvedValue({
      ok: true,
      via: 'staff',
      user: { id: '33333333-3333-4333-8333-333333333333', role: 'BCBA' },
    });

    const result = await saveIntakeProgress(PACKET_ID, { childName: 'Protected' });

    expect(result).toEqual({
      success: false,
      error: 'You are not assigned to this client.',
    });
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(CLIENT_ID);
    expect(mocks.prisma.intakePacket.updateMany).not.toHaveBeenCalled();
  });

  it('locks parent autosave while a submitted packet is under review', async () => {
    mocks.requireStaffOrParent.mockResolvedValue({
      ok: true,
      via: 'parent',
      packetId: PACKET_ID,
      clientId: CLIENT_ID,
    });
    mocks.prisma.intakePacket.findUnique.mockResolvedValue({
      clientId: CLIENT_ID,
      status: 'SUBMITTED',
      updatedAt: UPDATED_AT,
      formData: {},
      rejectionDetails: {},
    });

    const result = await saveIntakeProgress(PACKET_ID, { childName: 'Changed' });

    expect(result).toEqual({
      success: false,
      error: 'This packet is currently locked while our team reviews it.',
    });
    expect(mocks.prisma.intakePacket.updateMany).not.toHaveBeenCalled();
  });

  it('denies staff schedule writes without client access', async () => {
    mocks.requireStaffOrParent.mockResolvedValue({
      ok: true,
      via: 'staff',
      user: { id: '33333333-3333-4333-8333-333333333333', role: 'BCBA' },
    });

    const result = await saveClientSchedule(CLIENT_ID, {});

    expect(result).toEqual({
      success: false,
      error: 'You are not assigned to this client.',
    });
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.client.updateMany).not.toHaveBeenCalled();
  });

  it('does not let a parent resubmit an individual form after packet submission', async () => {
    mocks.requireStaffOrParent.mockResolvedValue({
      ok: true,
      via: 'parent',
      packetId: PACKET_ID,
      clientId: CLIENT_ID,
    });
    mocks.prisma.intakePacket.findUnique.mockResolvedValue({
      clientId: CLIENT_ID,
      status: 'SUBMITTED',
      updatedAt: UPDATED_AT,
      formData: {},
      consentFormComplete: true,
    });

    const result = await submitForm01(PACKET_ID, { childName: 'Changed' });

    expect(result).toEqual({
      success: false,
      error: 'This intake packet is not editable.',
    });
    expect(mocks.prisma.intakePacket.updateMany).not.toHaveBeenCalled();
  });

  it('denies staff change requests without access to the packet client', async () => {
    mocks.requireStaffOrParent.mockResolvedValue({
      ok: true,
      via: 'staff',
      user: { id: '33333333-3333-4333-8333-333333333333', role: 'BCBA' },
    });
    mocks.prisma.intakePacket.findUnique.mockResolvedValue({
      id: PACKET_ID,
      clientId: CLIENT_ID,
      updatedAt: UPDATED_AT,
    });

    const result = await requestClientChanges('live-token', 'Please reopen section one.');

    expect(result).toEqual({ error: 'You are not assigned to this client.' });
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(CLIENT_ID);
    expect(mocks.prisma.intakePacket.updateMany).not.toHaveBeenCalled();
  });
});
