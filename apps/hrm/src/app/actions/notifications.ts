'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getNotifications(userId?: string) {
  try {
    const where: any = {};
    if (userId) {
      where.userId = userId;
    } else {
      // If no explicit userId provided, do not fetch unassigned HR notifications for applicant accounts
      where.userId = '00000000-0000-0000-0000-000000000000';
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const unreadCount = await prisma.notification.count({
      where: { ...where, isRead: false }
    });

    return { success: true, notifications, unreadCount };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { success: false, notifications: [], unreadCount: 0, error: 'Failed to fetch notifications' };
  }
}

export async function createNotification(data: {
  userId?: string;
  title: string;
  message: string;
  type?: 'INFO' | 'WARNING' | 'ALERT';
  linkUrl?: string;
}) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type || 'INFO',
        linkUrl: data.linkUrl
      }
    });

    revalidatePath('/', 'layout');
    return { success: true, notification };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error: 'Failed to create notification' };
  }
}

export async function markNotificationAsRead(id: string) {
  try {
    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    revalidatePath('/', 'layout');
    return { success: true, notification };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { success: false, error: 'Failed to mark notification as read' };
  }
}

export async function markAllNotificationsAsRead(userId?: string) {
  try {
    const where: any = { isRead: false };
    if (userId) where.userId = userId;

    await prisma.notification.updateMany({
      where,
      data: { isRead: true }
    });

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return { success: false, error: 'Failed to mark all as read' };
  }
}
