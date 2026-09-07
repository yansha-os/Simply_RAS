'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireStaffOrParent } from '@/lib/magicLinkGuard';

type PacketRef = { packetId?: string; clientId?: string; token?: string };

export async function getClientNotifications(ref: PacketRef) {
  const gate = await requireStaffOrParent(ref);
  if (!gate.ok) {
    return {
      success: false,
      notifications: [],
      unreadCount: 0,
      error: gate.error,
    };
  }

  const clientId = gate.clientId;
  if (!clientId) {
    return {
      success: false,
      notifications: [],
      unreadCount: 0,
      error: 'Missing client context.',
    };
  }

  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.notification.count({
        where: { clientId, isRead: false },
      }),
    ]);

    return {
      success: true,
      notifications,
      unreadCount,
    };
  } catch (error) {
    console.error(
      'getClientNotifications failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      notifications: [],
      unreadCount: 0,
      error: 'Failed to load notifications.',
    };
  }
}

export async function markClientNotificationAsRead(
  ref: PacketRef,
  notificationId: string
) {
  const gate = await requireStaffOrParent(ref);
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }

  const clientId = gate.clientId;
  if (!clientId) {
    return { success: false, error: 'Missing client context.' };
  }

  try {
    const res = await prisma.notification.updateMany({
      where: { id: notificationId, clientId },
      data: { isRead: true },
    });

    if (res.count === 0) {
      return { success: false, error: 'Notification not found.' };
    }

    revalidatePath('/magic-link/[id]', 'page');
    return { success: true };
  } catch (error) {
    console.error(
      'markClientNotificationAsRead failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to update notification.' };
  }
}

export async function markAllClientNotificationsAsRead(ref: PacketRef) {
  const gate = await requireStaffOrParent(ref);
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }

  const clientId = gate.clientId;
  if (!clientId) {
    return { success: false, error: 'Missing client context.' };
  }

  try {
    await prisma.notification.updateMany({
      where: { clientId, isRead: false },
      data: { isRead: true },
    });

    revalidatePath('/magic-link/[id]', 'page');
    return { success: true };
  } catch (error) {
    console.error(
      'markAllClientNotificationsAsRead failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to update notifications.' };
  }
}
