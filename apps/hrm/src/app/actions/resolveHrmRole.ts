'use server';

import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type ResolvedHrmUiRole =
  | 'HEAD_HR'
  | 'HR_AGENT'
  | 'FINANCE'
  | 'RBT'
  | 'APPLICANT'
  | 'NONE';

const STAFF_TO_HRM: Record<string, ResolvedHrmUiRole> = {
  HEAD_HR: 'HEAD_HR',
  HR: 'HEAD_HR',
  HR_AGENT: 'HR_AGENT',
  FINANCE: 'FINANCE',
  PAYROLL: 'FINANCE',
  RBT: 'RBT',
  CEO: 'HEAD_HR',
  OPS_DIRECTOR: 'HEAD_HR',
  ADMIN: 'HEAD_HR',
  SUPER_ADMIN: 'HEAD_HR',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDevImpersonationEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true'
  );
}

/**
 * Resolve HRM chrome role for sidebar/header.
 * Device-session applicants who are HIRED are RBTs (not applicants).
 * DevTools Active RBT role cookie is checked before leftover applicant sessions.
 */
export async function resolveHrmUiRole(): Promise<ResolvedHrmUiRole> {
  if (isDevImpersonationEnabled()) {
    try {
      const cookieStore = await cookies();
      const impersonateRole = cookieStore.get('dev_impersonate_role')?.value;
      if (impersonateRole === 'RBT') return 'RBT';
      if (impersonateRole === 'APPLICANT') return 'APPLICANT';
      if (impersonateRole && STAFF_TO_HRM[impersonateRole]) {
        return STAFF_TO_HRM[impersonateRole];
      }
    } catch {
      /* continue */
    }
  }

  const user = await getCurrentUser();
  if (user) {
    const mapped = STAFF_TO_HRM[String(user.role)];
    if (mapped) return mapped;
  }

  try {
    const cookieStore = await cookies();
    const roleCookie = cookieStore.get('ras_hrm_role')?.value;
    const candidateId = cookieStore.get('ras_device_session_token')?.value;

    if (candidateId && UUID_RE.test(candidateId)) {
      const candidate = await prisma.atsCandidate.findUnique({
        where: { id: candidateId },
        select: { stage: true },
      });
      if (candidate?.stage === 'HIRED') return 'RBT';
      if (candidate) return 'APPLICANT';
    }

    if (roleCookie === 'RBT') return 'RBT';
    if (roleCookie === 'APPLICANT') return 'APPLICANT';
  } catch {
    // fall through
  }

  return 'NONE';
}
