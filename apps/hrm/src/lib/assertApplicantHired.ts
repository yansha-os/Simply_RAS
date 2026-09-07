import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import {
  CANDIDATE_SESSION_COOKIE,
  DEVICE_FINGERPRINT_COOKIE,
  resolveFingerprintValidCandidate,
} from '@/lib/candidateDeviceSession';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staff RBT surfaces (Schedule / Job Board) require AtsCandidate.stage === HIRED.
 * Accepts device-session applicants who are actually hired, linked RBT users,
 * or Dev Tools impersonation when enabled.
 *
 * IMPORTANT: On failure do NOT redirect to `/rbt` when the client chrome thinks the user
 * is staff RBT — that fights HrmSidebar's `/rbt` → `/rbt/schedule` redirect and loops.
 * Client-writable role cookies never grant access.
 */
export async function assertApplicantHired(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCandidate = await resolveFingerprintValidCandidate(
    cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
    cookieStore.get(DEVICE_FINGERPRINT_COOKIE)?.value
  );
  if (sessionCandidate?.stage === 'HIRED') return;

  if (isDevToolsEnabled()) {
    const impersonatedRole = cookieStore.get('dev_impersonate_role')?.value;
    if (
      impersonatedRole === 'RBT' ||
      impersonatedRole === 'HEAD_HR' ||
      impersonatedRole === 'HR_AGENT'
    ) {
      return;
    }

    const impersonatedUserId = cookieStore.get('dev_impersonate_user_id')?.value;
    if (impersonatedUserId && UUID_RE.test(impersonatedUserId)) {
      const impersonated = await prisma.user.findUnique({
        where: { id: impersonatedUserId },
        select: { role: true },
      });
      if (impersonated && ['RBT', 'HEAD_HR', 'HR_AGENT'].includes(impersonated.role)) {
        return;
      }
    }
  }

  const user = await getCurrentUser();
  if (
    user &&
    user.isActive !== false &&
    ['RBT', 'HEAD_HR', 'HR_AGENT', 'ADMIN'].includes(user.role)
  ) {
    return;
  }

  // Soft landing: applicant onboarding home. Sidebar must NOT bounce this to /rbt/schedule
  // unless the candidate is actually hired (isHired), or we get a redirect loop.
  redirect('/rbt');
}
