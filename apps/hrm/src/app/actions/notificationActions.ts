'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import {
  CANDIDATE_SESSION_COOKIE,
  DEVICE_FINGERPRINT_COOKIE,
  resolveFingerprintValidCandidate,
} from '@/lib/candidateDeviceSession';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type RecipientGate =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function requireNotificationRecipient(): Promise<RecipientGate> {
  const cookieStore = await cookies();
  const candidate = await resolveFingerprintValidCandidate(
    cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
    cookieStore.get(DEVICE_FINGERPRINT_COOKIE)?.value
  );

  // A fingerprint-validated hired candidate session is authoritative. Raw
  // candidate or role cookies never establish a notification recipient.
  if (candidate?.stage === 'HIRED') {
    if (!candidate.userId) {
      return { ok: false, error: 'Not authenticated. Please sign in.' };
    }
    const activeUser = await prisma.user.findFirst({
      where: { id: candidate.userId, isActive: true, role: 'RBT' },
      select: { id: true },
    });
    return activeUser
      ? { ok: true, userId: activeUser.id }
      : { ok: false, error: 'Not authenticated. Please sign in.' };
  }

  const user = await getCurrentUser();
  if (!user || user.id === 'mock-user-id' || user.isActive !== true) {
    return { ok: false, error: 'Not authenticated. Please sign in.' };
  }
  return { ok: true, userId: user.id };
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
