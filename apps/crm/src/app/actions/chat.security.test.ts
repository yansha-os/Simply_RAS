import { beforeEach, describe, expect, it, vi } from 'vitest';

const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  prisma: {
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    staffMessage: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/auth-guard', () => ({ requireStaff: mocks.requireStaff }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

import {
  getStaffMembers,
  markStaffThreadRead,
  sendStaffMessage,
} from './chat';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: ME, role: 'CASE_COORDINATOR', isActive: true },
  });
  mocks.prisma.user.findFirst.mockResolvedValue({ id: PEER });
  mocks.prisma.user.findMany.mockResolvedValue([]);
  mocks.prisma.staffMessage.create.mockResolvedValue({ id: 'message-id' });
  mocks.prisma.staffMessage.updateMany.mockResolvedValue({ count: 1 });
});

describe('CRM direct staff chat security', () => {
  it('lists only active users with a staff role and excludes the actor', async () => {
    await getStaffMembers();

    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          role: { in: expect.arrayContaining(['CASE_COORDINATOR', 'BCBA', 'RBT']) },
          NOT: { id: ME },
        }),
      })
    );
  });

  it('rejects malformed, self, inactive, and non-staff recipients before writing', async () => {
    expect(await sendStaffMessage('not-a-uuid', 'hello')).toMatchObject({ success: false });
    expect(await sendStaffMessage(ME, 'hello')).toMatchObject({ success: false });

    mocks.prisma.user.findFirst.mockResolvedValue(null);
    expect(await sendStaffMessage(PEER, 'hello')).toMatchObject({ success: false });

    expect(mocks.prisma.staffMessage.create).not.toHaveBeenCalled();
  });

  it('trims a bounded message and resolves the recipient through the staff allowlist', async () => {
    const result = await sendStaffMessage(PEER, '  Care-team update  ');

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: PEER,
        isActive: true,
        role: { in: expect.arrayContaining(['CASE_COORDINATOR', 'BCBA', 'RBT']) },
      },
      select: { id: true },
    });
    expect(mocks.prisma.staffMessage.create).toHaveBeenCalledWith({
      data: { senderId: ME, receiverId: PEER, content: 'Care-team update' },
    });
  });

  it('scopes read receipts to inbound unread messages for the authenticated actor', async () => {
    const result = await markStaffThreadRead(PEER);

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.staffMessage.updateMany).toHaveBeenCalledWith({
      where: { senderId: PEER, receiverId: ME, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
