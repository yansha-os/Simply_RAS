'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

type RecipientGate =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function requireNotificationRecipient(): Promise<RecipientGate> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  if (gate.user.id === 'mock-user-id') {
    return { ok: false, error: 'Not authenticated. Please sign in.' };
  }
  return { ok: true, userId: gate.user.id };
}

export async function getNotifications() {
  const gate = await requireNotificationRecipient();
  if (!gate.ok) {
    return {
      success: false,
      notifications: [],
      unreadCount: 0,
      error: gate.error,
    };
  }

  try {
    const where = { userId: gate.userId };
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.notification.count({
        where: { userId: gate.userId, isRead: false },
      }),
    ]);

    return { success: true, notifications, unreadCount };
  } catch (error) {
    console.error(
      'Error fetching notifications:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      notifications: [],
      unreadCount: 0,
      error: 'Failed to fetch notifications',
    };
  }
}

export async function markNotificationAsRead(id: string) {
  const gate = await requireNotificationRecipient();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const updated = await prisma.notification.updateMany({
      where: { id, userId: gate.userId },
      data: { isRead: true },
    });
    if (updated.count === 0) {
      return { success: false, error: 'Notification not found.' };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error(
      'Error marking notification as read:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to mark notification as read' };
  }
}

export async function markAllNotificationsAsRead() {
  const gate = await requireNotificationRecipient();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    await prisma.notification.updateMany({
      where: { userId: gate.userId, isRead: false },
      data: { isRead: true },
    });

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error(
      'Error marking all notifications as read:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to mark all as read' };
  }
}
