'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { resolveActingRbtUserId } from '@/lib/resolveActingRbt';

export interface RbtProfileSyncInput {
  userId?: string;
  availabilitySlots: Record<string, boolean>;
  preferredBoroughs: string[];
  totalSelectedHours: number;
}

export async function syncRbtProfileToCrm(data: RbtProfileSyncInput) {
  try {
    // Identity is anchored to the acting session RBT — never an arbitrary row.
    const rbtUserId = await resolveActingRbtUserId(data.userId);
    if (!rbtUserId) {
      return { success: false, error: 'No active RBT profile found.' };
    }

    // Find existing RbtOnboarding record for this RBT
    const existingOnboarding = await prisma.rbtOnboarding.findFirst({
      where: { rbtId: rbtUserId }
    });

    if (existingOnboarding) {
      await prisma.rbtOnboarding.update({
        where: { id: existingOnboarding.id },
        data: {
          updatedAt: new Date()
        }
      });
    }

    // Revalidate HRM-local paths only. (/portal-hr/* and /portal-case-coord/* are
    // CRM routes — revalidating them from HRM is a cross-app no-op, so removed.)
    revalidatePath('/rbt/availability');

    return {
      success: true,
      syncStatus: 'SYNCED_TO_CRM_CASE_COORDINATION',
      message: `Successfully synced ${data.totalSelectedHours} available hours across ${data.preferredBoroughs.join(', ')} to CRM Case Coordinators!`
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : undefined;
    console.error('Error syncing RBT profile to CRM:', message || 'Unknown error');
    return {
      success: false,
      error: message || 'Failed to sync availability to CRM.'
    };
  }
}
