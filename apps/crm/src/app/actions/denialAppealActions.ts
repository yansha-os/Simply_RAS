'use server';

import { requireStaff } from '@/lib/auth-guard';
import {
  compileDenialAppealPacket,
  CARC_DENIAL_DICTIONARY,
  type DenialAppealInput,
  type DenialAppealPacket,
  type DenialReasonInfo,
} from '@/lib/denialAppealEngine';

export async function generateClaimDenialAppeal(input: DenialAppealInput): Promise<{
  success: boolean;
  packet?: DenialAppealPacket;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'BILLING', 'OPS_DIRECTOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    if (!input.claimId) {
      return { success: false, error: 'Claim ID is required.' };
    }

    const packet = compileDenialAppealPacket(input);

    return {
      success: true,
      packet,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate denial appeal packet.',
    };
  }
}

export async function getStandardDenialReasons(): Promise<{
  success: boolean;
  reasons?: DenialReasonInfo[];
  error?: string;
}> {
  try {
    const gate = await requireStaff();
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const reasons = Object.values(CARC_DENIAL_DICTIONARY);

    return {
      success: true,
      reasons,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve denial reasons.',
    };
  }
}
