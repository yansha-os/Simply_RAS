import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  notifyRoles,
  notifyClient,
  notifyCaseTeam,
  normalizeNotificationLink,
} from '../notificationDispatcher';
import { prisma } from '@/lib/prisma';

type ClientLookupResult = Awaited<ReturnType<typeof prisma.client.findUnique>>;
type NotificationCreateResult = Awaited<ReturnType<typeof prisma.notification.create>>;
type UserListResult = Awaited<ReturnType<typeof prisma.user.findMany>>;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    client: {
      findUnique: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

describe('notificationDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeNotificationLink', () => {
    it('normalizes valid relative paths', () => {
      const res = normalizeNotificationLink('/client/123?tab=messages#bottom');
      expect(res).toEqual({
        ok: true,
        linkUrl: '/client/123?tab=messages#bottom',
      });
    });

    it('rejects unsafe control characters', () => {
      const res = normalizeNotificationLink('/client\u0000/test');
      expect(res.ok).toBe(false);
    });

    it('handles undefined links gracefully', () => {
      const res = normalizeNotificationLink(undefined);
      expect(res).toEqual({
        ok: true,
        linkUrl: undefined,
      });
    });
  });

  describe('notifyClient', () => {
    it('creates a client notification for valid clientId', async () => {
      const validClientId = '12345678-1234-4234-8234-123456789abc';
      vi.mocked(prisma.client.findUnique).mockResolvedValueOnce({
        id: validClientId,
      } as ClientLookupResult);

      vi.mocked(prisma.notification.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.notification.create).mockResolvedValueOnce({
        id: 'notif-1',
        clientId: validClientId,
        title: 'Test Notification',
        message: 'Hello Parent',
        type: 'INFO',
      } as NotificationCreateResult);

      const res = await notifyClient(validClientId, {
        title: 'Test Notification',
        message: 'Hello Parent',
        type: 'INFO',
        linkUrl: '/magic-link/?tab=messages',
      });

      expect(res.success).toBe(true);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          clientId: validClientId,
          title: 'Test Notification',
          message: 'Hello Parent',
          type: 'INFO',
          linkUrl: '/magic-link/?tab=messages',
        },
      });
    });

    it('rejects invalid client UUIDs', async () => {
      const res = await notifyClient('not-a-uuid', {
        title: 'Test',
        message: 'Test',
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid client ID');
    });
  });

  describe('notifyCaseTeam', () => {
    it('fans out to assigned case coordinator, BCBA, and clinical support', async () => {
      const validClientId = '12345678-1234-4234-8234-123456789abc';
      const ccId = '22222222-2222-4222-8222-222222222222';
      const bcbaId = '33333333-3333-4333-8333-333333333333';

      vi.mocked(prisma.client.findUnique).mockResolvedValueOnce({
        id: validClientId,
        caseCoordinatorId: ccId,
        bcbaId: bcbaId,
        clinicalSupportId: null,
        rbtId: null,
      } as ClientLookupResult);

      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { id: ccId },
        { id: bcbaId },
      ] as UserListResult);

      vi.mocked(prisma.notification.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 2 });

      const res = await notifyCaseTeam(validClientId, {
        title: 'New Family Message',
        message: 'Hello Case Team',
        type: 'INFO',
      });

      expect(res.success).toBe(true);
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: ccId }),
          expect.objectContaining({ userId: bcbaId }),
        ]),
      });
    });
  });

  describe('notifyRoles', () => {
    it('notifies all active users matching specified roles', async () => {
      const intakeUserId = '44444444-4444-4444-8444-444444444444';

      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { id: intakeUserId },
      ] as UserListResult);

      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { id: intakeUserId },
      ] as UserListResult);

      vi.mocked(prisma.notification.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 1 });

      const res = await notifyRoles(['INTAKE_PA_COORDINATOR'], {
        title: 'Intake Packet Submitted',
        message: 'Review needed',
      });

      expect(res.success).toBe(true);
    });
  });
});
