'use server';

import { requireStaff, CLINICAL_ROLES, LEADERSHIP_ROLES } from '@/lib/auth-guard';
import { getAgencySupervisionScorecard } from '@/lib/supervisionCompliance';

export async function getSupervisionComplianceScorecard(year?: number, month?: number) {
  const allowedRoles = [...CLINICAL_ROLES, ...LEADERSHIP_ROLES];
  const gate = await requireStaff(allowedRoles);
  if (!gate.ok) {
    return { success: false, error: gate.error, scorecard: null };
  }

  const targetYear = year || new Date().getFullYear();
  const targetMonth = month || new Date().getMonth() + 1;

  try {
    const scorecard = await getAgencySupervisionScorecard(targetYear, targetMonth);
    return { success: true, scorecard };
  } catch (error) {
    console.error(
      'getSupervisionComplianceScorecard failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: 'Failed to calculate supervision compliance scorecard.',
      scorecard: null,
    };
  }
}
