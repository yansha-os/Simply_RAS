import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getClientNotifications,
  markClientNotificationAsRead,
  markAllClientNotificationsAsRead,
} from '../clientNotificationActions';
import { prisma } from '@/lib/prisma';
import { requireStaffOrParent } from '@/lib/magicLinkGuard';
import type { Notification } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/magicLinkGuard', () => ({
  requireStaffOrParent: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('clientNotificationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClientNotifications', () => {
    it('returns notifications and unreadCount for authorized parent', async () => {
      const clientId = '12345678-1234-4234-8234-123456789abc';
      vi.mocked(requireStaffOrParent).mockResolvedValueOnce({
        ok: true,
        via: 'parent',
        packetId: 'packet-1',
        clientId,
      });

      const mockNotifs = [
        {
          id: 'n-1',
          clientId,
          title: 'Document update',
          message: 'Please re-upload insurance',
          type: 'WARNING',
          createdAt: new Date(),
          isRead: false,
          linkUrl: null,
          userId: null,
        },
      ] satisfies Notification[];

      vi.mocked(prisma.notification.findMany).mockResolvedValueOnce(mockNotifs);
      vi.mocked(prisma.notification.count).mockResolvedValueOnce(1);

      const res = await getClientNotifications({ token: 'test-token' });

      expect(res.success).toBe(true);
      expect(res.notifications).toHaveLength(1);
      expect(res.unreadCount).toBe(1);
    });

    it('rejects unauthorized access attempts', async () => {
      vi.mocked(requireStaffOrParent).mockResolvedValueOnce({
        ok: false,
        error: 'Invalid or expired magic link',
      });

      const res = await getClientNotifications({ token: 'expired-token' });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid or expired magic link');
    });
  });

  describe('markClientNotificationAsRead', () => {
    it('marks a single notification as read', async () => {
      const clientId = '12345678-1234-4234-8234-123456789abc';
      vi.mocked(requireStaffOrParent).mockResolvedValueOnce({
        ok: true,
        via: 'parent',
        packetId: 'packet-1',
        clientId,
      });

      vi.mocked(prisma.notification.updateMany).mockResolvedValueOnce({ count: 1 });

      const res = await markClientNotificationAsRead(
        { token: 'valid-token' },
        'notif-1'
      );

      expect(res.success).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', clientId },
        data: { isRead: true },
      });
    });
  });

  describe('markAllClientNotificationsAsRead', () => {
    it('marks all unread notifications as read for the client', async () => {
      const clientId = '12345678-1234-4234-8234-123456789abc';
      vi.mocked(requireStaffOrParent).mockResolvedValueOnce({
        ok: true,
        via: 'parent',
        packetId: 'packet-1',
        clientId,
      });

      vi.mocked(prisma.notification.updateMany).mockResolvedValueOnce({ count: 3 });

      const res = await markAllClientNotificationsAsRead({ token: 'valid-token' });

      expect(res.success).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { clientId, isRead: false },
        data: { isRead: true },
      });
    });
  });
});
