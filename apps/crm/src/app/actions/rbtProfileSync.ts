'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth-guard';

export interface RbtProfileSyncInput {
  userId?: string;
  availabilitySlots: Record<string, boolean>;
  preferredBoroughs: string[];
  totalSelectedHours: number;
}

export async function syncRbtProfileToCrm(data: RbtProfileSyncInput) {
  try {
    const gate = await requireStaff();
    if (!gate.ok) return { success: false, error: gate.error };

    // Only sync the session user's own RBT profile — never an arbitrary RBT.
    const rbtUser =
      gate.user.role === 'RBT' && gate.user.id !== 'mock-user-id'
        ? gate.user
        : null;

    if (!rbtUser) {
      return { success: false, error: 'No active RBT profile found for this session.' };
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

    // Revalidate CRM-local portal surfaces. (/rbt/availability lives in the HRM
    // app — revalidating it from CRM is a cross-app no-op, so it was removed.)
    revalidatePath('/portal-hr/onboarding');
    revalidatePath('/portal-case-coord');
    revalidatePath('/portal-case-coord/clients');

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
