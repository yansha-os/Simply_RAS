'use server';

import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import {
  CANDIDATE_SESSION_COOKIE,
  DEVICE_FINGERPRINT_COOKIE,
  resolveFingerprintValidCandidate,
} from '@/lib/candidateDeviceSession';

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

/**
 * Resolve HRM chrome role for sidebar/header.
 * Device-session applicants are RBT only when AtsCandidate.stage === HIRED.
 * LS-54 SIGNED alone never grants staff chrome. Role cookies never grant access
 * outside DevTools impersonation.
 */
export async function resolveHrmUiRole(): Promise<ResolvedHrmUiRole> {
  try {
    const cookieStore = await cookies();
    const candidate = await resolveFingerprintValidCandidate(
      cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
      cookieStore.get(DEVICE_FINGERPRINT_COOKIE)?.value
    );
    if (candidate?.stage === 'HIRED') return 'RBT';
    if (candidate) return 'APPLICANT';
  } catch {
    /* continue */
  }

  if (isDevToolsEnabled()) {
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

  return 'NONE';
}
