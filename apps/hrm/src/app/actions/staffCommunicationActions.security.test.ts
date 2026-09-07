import { beforeEach, describe, expect, it, vi } from 'vitest';

const RBT_ID = '11111111-1111-4111-8111-111111111111';
const PEER_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  resolveActingRbtUserId: vi.fn(),
  createNotification: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    client: { findFirst: vi.fn(), findMany: vi.fn() },
    caseApplication: { findFirst: vi.fn(), findMany: vi.fn() },
    staffMessage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/resolveActingRbt', () => ({
  resolveActingRbtUserId: mocks.resolveActingRbtUserId,
}));
vi.mock('@/app/actions/notifications', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  getRbtStaffThread,
  sendRbtStaffMessage,
} from './staffCommunicationActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveActingRbtUserId.mockResolvedValue(RBT_ID);
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.client.findFirst.mockResolvedValue(null);
  mocks.prisma.caseApplication.findFirst.mockResolvedValue(null);
  mocks.prisma.staffMessage.findFirst.mockResolvedValue(null);
});

describe('RBT staff communication scope', () => {
  it('rejects a recipient outside the RBT care-team relationships', async () => {
    const result = await sendRbtStaffMessage(PEER_ID, 'Attempted message');

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.staffMessage.create).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('rejects thread reads outside the RBT care-team relationships', async () => {
    const result = await getRbtStaffThread(PEER_ID);

    expect(result).toMatchObject({ success: false, messages: [] });
    expect(mocks.prisma.staffMessage.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.staffMessage.updateMany).not.toHaveBeenCalled();
  });

  it('scopes read-receipt writes to the authenticated RBT inbox and selected peer', async () => {
    mocks.prisma.user.findFirst.mockResolvedValueOnce({ id: PEER_ID });
    mocks.prisma.staffMessage.findMany.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        senderId: PEER_ID,
        receiverId: RBT_ID,
        content: 'Unread update',
        createdAt: new Date('2026-09-05T12:00:00.000Z'),
        readAt: null,
        sender: { firstName: 'Casey', lastName: 'Coordinator' },
      },
    ]);

    const result = await getRbtStaffThread(PEER_ID);

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.staffMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['33333333-3333-4333-8333-333333333333'] },
        senderId: PEER_ID,
        receiverId: RBT_ID,
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it('allows an active agency case coordinator surfaced by the inbox policy', async () => {
    mocks.prisma.user.findFirst
      .mockResolvedValueOnce({ id: PEER_ID })
      .mockResolvedValueOnce({
        id: PEER_ID,
        firstName: 'Casey',
        lastName: 'Coordinator',
      });
    mocks.prisma.staffMessage.create.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      senderId: RBT_ID,
      receiverId: PEER_ID,
      content: 'Care-team message',
      createdAt: new Date('2026-09-05T12:00:00.000Z'),
      sender: { firstName: 'Riley', lastName: 'Technician' },
    });
    mocks.createNotification.mockResolvedValue({ success: true });

    const result = await sendRbtStaffMessage(PEER_ID, 'Care-team message');

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.staffMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          senderId: RBT_ID,
          receiverId: PEER_ID,
          content: 'Care-team message',
        },
      })
    );
  });
});
