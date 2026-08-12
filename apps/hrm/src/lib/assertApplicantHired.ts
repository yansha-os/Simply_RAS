import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isDevToolsEnabled } from '@/lib/devToolsGate';

const SESSION_COOKIE = 'ras_device_session_token';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDevImpersonationEnabled() {
  return isDevToolsEnabled();
}

/**
 * Staff RBT surfaces (Schedule / Job Board) require AtsCandidate.stage === HIRED.
 * Accepts device-session applicants, linked RBT users, or Dev Tools RBT impersonation.
 *
 * IMPORTANT: On failure do NOT redirect to `/rbt` when the client chrome thinks the user
 * is staff RBT — that fights HrmSidebar's `/rbt` → `/rbt/schedule` redirect and loops.
 */
export async function assertApplicantHired(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCandidateId = cookieStore.get(SESSION_COOKIE)?.value || null;

  if (sessionCandidateId && UUID_RE.test(sessionCandidateId)) {
    const fromSession = await prisma.atsCandidate.findUnique({
      where: { id: sessionCandidateId },
      select: { stage: true },
    });
    if (fromSession?.stage === 'HIRED') return;
  }

  // Dev Tools may set role cookie even when Supabase session is still Head HR
  if (isDevImpersonationEnabled()) {
    const impersonatedRole = cookieStore.get('dev_impersonate_role')?.value;
    if (impersonatedRole === 'RBT') return;

    const impersonatedUserId = cookieStore.get('dev_impersonate_user_id')?.value;
    if (impersonatedUserId && UUID_RE.test(impersonatedUserId)) {
      const impersonated = await prisma.user.findUnique({
        where: { id: impersonatedUserId },
        select: { role: true },
      });
      if (impersonated?.role === 'RBT') return;
    }
  }

  const user = await getCurrentUser();
  if (user?.role === 'RBT' && user.id !== 'mock-user-id') {
    const linked = await prisma.atsCandidate.findFirst({
      where: { userId: user.id, stage: 'HIRED' },
      select: { id: true },
    });
    if (linked) return;
  }

  if (isDevImpersonationEnabled() && user?.role === 'RBT') {
    return;
  }

  // Soft landing: applicant onboarding home. Sidebar must NOT bounce this to /rbt/schedule
  // unless the candidate is actually hired (isHired), or we get a redirect loop.
  redirect('/rbt');
}
