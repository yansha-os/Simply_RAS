import type { Role } from '@repo/db';
import { getCurrentUser } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Non-throwing gates for Server Actions (server-action-pattern: return
// `{ error }` instead of throwing). Impersonated dev users flow through
// getCurrentUser(), so dev-tools impersonation keeps working.
// ---------------------------------------------------------------------------

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type Gate =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

/**
 * Require an authenticated, active staff session. Optionally restrict to a
 * role list. Use inside server actions:
 *
 *   const gate = await requireStaff(HR_ROLES);
 *   if (!gate.ok) return { success: false, error: gate.error };
 */
export async function requireStaff(allowedRoles?: readonly Role[]): Promise<Gate> {
  const user = await getCurrentUser();
  if (!user || user.isActive === false) {
    return { ok: false, error: 'Not authenticated. Please sign in.' };
  }
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role as Role)) {
    return { ok: false, error: 'You are not authorized to perform this action.' };
  }
  return { ok: true, user: user as SessionUser };
}

/** Leadership can touch everything; team role lists include them. */
export const LEADERSHIP_ROLES: readonly Role[] = ['CEO', 'CLINICAL_DIRECTOR', 'OPS_DIRECTOR'];

export const HR_ROLES: readonly Role[] = [...LEADERSHIP_ROLES, 'HR', 'HEAD_HR', 'HR_AGENT'];

export const PAYROLL_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'FINANCE',
  'HR',
  'HEAD_HR',
];

export const STAFFING_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'HR',
  'HEAD_HR',
  'HR_AGENT',
  'CASE_COORDINATOR',
];

export async function requireRole(allowedRoles: Role[]) {
  const user = await getCurrentUser();

  if (!user || user.isActive === false) {
    throw new Error('UNAUTHORIZED: Authentication required.');
  }

  if (!allowedRoles.includes(user.role as Role)) {
    throw new Error(`FORBIDDEN: Role '${user.role}' is not authorized to access this resource.`);
  }

  return user;
}

export function sanitizePhiData<T extends Record<string, unknown>>(data: T): Partial<T> {
  const sanitized: Record<string, unknown> = { ...data };

  delete sanitized.medicaidId;
  delete sanitized.memberId;
  delete sanitized.guardianPhone;
  delete sanitized.guardianEmail;
  delete sanitized.parentAddress;
  delete sanitized.treatmentPlan;
  delete sanitized.intakePacket;

  return sanitized as Partial<T>;
}
