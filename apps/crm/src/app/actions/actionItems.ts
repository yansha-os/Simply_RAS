'use server';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { createNotification } from './notifications';
import {
  CASE_COORD_ROLES,
  LEADERSHIP_ROLES,
  requireClientAccess,
  requireStaff,
} from '@/lib/auth-guard';
import type { Role } from '@repo/db';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLeadership(role: string): boolean {
  return LEADERSHIP_ROLES.includes(role as Role);
}

export async function getActionItems(coordinatorId?: string) {
  try {
    const gate = await requireStaff(CASE_COORD_ROLES);
    if (!gate.ok) return { success: false, actionItems: [], error: gate.error };

    if (coordinatorId && !UUID_PATTERN.test(coordinatorId)) {
      return { success: false, actionItems: [], error: 'Invalid coordinator.' };
    }
    const where: Prisma.ActionItemWhereInput = {
      assigneeId:
        coordinatorId && isLeadership(gate.user.role)
          ? coordinatorId
          : gate.user.id,
    };

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
    const gate = await requireStaff(CASE_COORD_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

    const title = data.title.trim();
    const description = data.description?.trim() || undefined;
    if (!title || title.length > 200 || (description?.length ?? 0) > 5_000) {
      return { success: false, error: 'Invalid action item content.' };
    }
    if (data.clientId && !UUID_PATTERN.test(data.clientId)) {
      return { success: false, error: 'Invalid client.' };
    }
    if (data.assigneeId && !UUID_PATTERN.test(data.assigneeId)) {
      return { success: false, error: 'Invalid assignee.' };
    }

    let authoritativeAssigneeId = data.assigneeId ?? gate.user.id;
    if (data.clientId) {
      const access = await requireClientAccess(data.clientId);
      if (!access.ok) return { success: false, error: access.error };
      const client = await prisma.client.findUnique({
        where: { id: data.clientId },
        select: { caseCoordinatorId: true },
      });
      if (!client) return { success: false, error: 'Client not found.' };
      if (!client.caseCoordinatorId) {
        return { success: false, error: 'Client has no assigned case coordinator.' };
      }
      authoritativeAssigneeId = client.caseCoordinatorId;
      if (data.assigneeId && data.assigneeId !== authoritativeAssigneeId) {
        return { success: false, error: 'Assignee does not match the client care team.' };
      }
    } else if (!isLeadership(gate.user.role) && authoritativeAssigneeId !== gate.user.id) {
      return { success: false, error: 'You can only assign action items to yourself.' };
    }

    const assignee = await prisma.user.findFirst({
      where: {
        id: authoritativeAssigneeId,
        isActive: true,
        role: { in: [...CASE_COORD_ROLES] },
      },
      select: { id: true },
    });
    if (!assignee) return { success: false, error: 'Assignee is unavailable.' };

    const actionItem = await prisma.actionItem.create({
      data: {
        title,
        description,
        clientId: data.clientId,
        assigneeId: assignee.id,
        creatorId: gate.user.id,
        dueDate: data.dueDate,
        status: 'OPEN'
      }
    });

    // Emit Notification
    await createNotification({
      userId: assignee.id,
      title,
      message: description || 'New action item assigned to your inbox.',
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
    const gate = await requireStaff(CASE_COORD_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };
    if (!UUID_PATTERN.test(id)) return { success: false, error: 'Invalid action item.' };

    const updated = await prisma.actionItem.updateMany({
      where: {
        id,
        status: 'OPEN',
        ...(isLeadership(gate.user.role) ? {} : { assigneeId: gate.user.id }),
      },
      data: {
        status: 'RESOLVED'
      }
    });
    if (updated.count !== 1) {
      return { success: false, error: 'Action item not found or already resolved.' };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Error resolving action item:', error);
    return { success: false, error: 'Failed to resolve action item' };
  }
}
