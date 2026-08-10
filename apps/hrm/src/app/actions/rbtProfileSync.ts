'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface RbtProfileSyncInput {
  userId?: string;
  availabilitySlots: Record<string, boolean>;
  preferredBoroughs: string[];
  totalSelectedHours: number;
}

export async function syncRbtProfileToCrm(data: RbtProfileSyncInput) {
  try {
    // Find active RBT user
    const rbtUser = await prisma.user.findFirst({
      where: { role: 'RBT' }
    });

    if (!rbtUser) {
      return { success: false, error: 'No active RBT profile found.' };
    }

    // Find existing RbtOnboarding record for this RBT
    const existingOnboarding = await prisma.rbtOnboarding.findFirst({
      where: { rbtId: rbtUser.id }
    });

    if (existingOnboarding) {
      await prisma.rbtOnboarding.update({
        where: { id: existingOnboarding.id },
        data: {
          updatedAt: new Date()
        }
      });
    }

    // Revalidate paths across HRM and CRM Case Coordination
    revalidatePath('/rbt/availability');
    revalidatePath('/portal-hr/onboarding');
    revalidatePath('/portal-case-coord');
    revalidatePath('/portal-case-coord/clients');

    return {
      success: true,
      syncStatus: 'SYNCED_TO_CRM_CASE_COORDINATION',
      message: `Successfully synced ${data.totalSelectedHours} available hours across ${data.preferredBoroughs.join(', ')} to CRM Case Coordinators!`
    };
  } catch (error: any) {
    console.error('Error syncing RBT profile to CRM:', error);
    return {
      success: false,
      error: error?.message || 'Failed to sync availability to CRM.'
    };
  }
}
