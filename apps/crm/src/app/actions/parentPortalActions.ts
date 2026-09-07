'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess } from '@/lib/auth-guard';
import {
  compileParentPortalSummary,
  type ParentPortalSummary,
} from '@/lib/parentPortalEngine';

export async function getParentPortalOverview(clientId: string): Promise<{
  success: boolean;
  summary?: ParentPortalSummary;
  error?: string;
}> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client ID is required.' };
    }

    const accessGate = await requireClientAccess(clientId);
    if (!accessGate.ok) {
      return { success: false, error: accessGate.error };
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        skillTargets: {
          select: {
            id: true,
            domain: true,
            title: true,
            targetStatus: true,
            updatedAt: true,
          },
        },
        sessions: {
          orderBy: { scheduledStart: 'desc' },
          take: 30,
          include: {
            bcba: { select: { firstName: true, lastName: true } },
            rbt: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!client) {
      return { success: false, error: 'Client not found.' };
    }

    const summary = compileParentPortalSummary({
      client: {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        guardianName: client.guardianName,
      },
      skillTargets: client.skillTargets,
      sessions: client.sessions,
    });

    return {
      success: true,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load parent portal overview.',
    };
  }
}
