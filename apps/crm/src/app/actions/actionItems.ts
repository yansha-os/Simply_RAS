'use server';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import { requireStaff } from '@/lib/auth-guard';

export async function getActionItems(coordinatorId?: string) {
  try {
    const gate = await requireStaff();
    if (!gate.ok) return { success: false, actionItems: [], error: gate.error };

    const where: Prisma.ActionItemWhereInput = {};
    if (coordinatorId) {
      where.assigneeId = coordinatorId;
    }

    const actionItems = await prisma.actionItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true
          }
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return { success: true, actionItems };
  } catch (error) {
    console.error('Error fetching action items:', error);
    return { success: false, actionItems: [], error: 'Failed to fetch action items' };
  }
}

export async function createActionItem(data: {
  title: string;
  description?: string;
  clientId?: string;
  assigneeId?: string;
  dueDate?: Date;
}) {
  try {
    const gate = await requireStaff();
    if (!gate.ok) return { success: false, error: gate.error };

    const actionItem = await prisma.actionItem.create({
      data: {
        title: data.title,
        description: data.description,
        clientId: data.clientId,
        assigneeId: data.assigneeId,
        dueDate: data.dueDate,
        status: 'OPEN'
      }
    });

    // Emit Notification
    await createNotification({
      userId: data.assigneeId,
      title: data.title,
      message: data.description || 'New action item assigned to your inbox.',
      type: 'WARNING',
      linkUrl: data.clientId ? `/client/${data.clientId}?mode=case-coord` : '/portal-case-coord/clients'
    });

    revalidatePath('/', 'layout');
    return { success: true, actionItem };
  } catch (error) {
    console.error('Error creating action item:', error);
    return { success: false, error: 'Failed to create action item' };
  }
}

export async function resolveActionItem(id: string) {
  try {
    const gate = await requireStaff();
    if (!gate.ok) return { success: false, error: gate.error };

    const actionItem = await prisma.actionItem.update({
      where: { id },
      data: {
        status: 'RESOLVED'
      }
    });

    revalidatePath('/', 'layout');
    return { success: true, actionItem };
  } catch (error) {
    console.error('Error resolving action item:', error);
    return { success: false, error: 'Failed to resolve action item' };
  }
}
