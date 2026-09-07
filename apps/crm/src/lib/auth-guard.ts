import type { Role } from '@repo/db';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function requireRole(allowedRoles: Role[]) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('UNAUTHORIZED: Authentication required.');
  }

  if (!allowedRoles.includes(user.role as Role)) {
    throw new Error(`FORBIDDEN: Role '${user.role}' is not authorized to access this resource.`);
  }

  return user;
}

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
 *   const gate = await requireStaff(BILLING_ROLES);
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

const PERSISTED_STAFF_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * Server Component read-boundary gate. `User.id` is a Postgres UUID, so
 * rejecting non-UUID actors prevents role-only dev impersonation and malformed
 * session actors from reaching PHI loaders. Persisted-user impersonation still
 * works because `getCurrentUser()` loads that real User row.
 */
export async function requirePersistedStaff(
  allowedRoles: readonly Role[]
): Promise<Gate> {
  const gate = await requireStaff(allowedRoles);
  if (
    !gate.ok ||
    gate.user.isActive !== true ||
    !PERSISTED_STAFF_ID.test(gate.user.id)
  ) {
    return { ok: false, error: 'Not found.' };
  }
  return gate;
}

/** Leadership can touch everything; portal role lists include them. */
export const LEADERSHIP_ROLES: readonly Role[] = ['CEO', 'CLINICAL_DIRECTOR', 'OPS_DIRECTOR'];

export const INTAKE_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'INTAKE_PA_COORDINATOR',
];

export const BILLING_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'BILLING',
  'FINANCE',
  'INTAKE_PA_COORDINATOR',
  'CLINICAL_SUPPORT',
];

export const CLINICAL_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'BCBA',
  'CLINICAL_SUPPORT',
];

export const CASE_COORD_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'CASE_COORDINATOR',
  'CLINICAL_SUPPORT',
];

/** Session claims queue — billing agents + leadership. */
export const SESSION_NOTES_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'BILLING',
  'FINANCE',
  /** @deprecated Alias of billing permissions — enum kept for DB compat. */
  'SESSION_NOTES_COORDINATOR',
];

/** Mark session notes converted / claim filed — same billing-agent workflow in CRM. */
export const SESSION_NOTES_CONVERSION_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'BILLING',
  'FINANCE',
  /** @deprecated Same permissions as BILLING — enum kept for DB compat. */
  'SESSION_NOTES_COORDINATOR',
];

/** @deprecated Prefer SESSION_NOTES_ROLES — kept for billing tracker imports. */
export const PLUTUS_TRACKER_ROLES: readonly Role[] = SESSION_NOTES_ROLES;

export const HR_ROLES: readonly Role[] = [...LEADERSHIP_ROLES, 'HR', 'HEAD_HR', 'HR_AGENT'];

/**
 * Client-scoped access: leadership + intake/billing/case-coord staff see all
 * clients; BCBA / RBT must be assigned to the client (or its case coordinator).
 */
export async function requireClientAccess(clientId: string): Promise<Gate> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;
  const user = gate.user;

  const roleSeesAllClients: readonly Role[] = [
    ...LEADERSHIP_ROLES,
    'INTAKE_PA_COORDINATOR',
    'CASE_COORDINATOR',
    'CLINICAL_SUPPORT',
    'SESSION_NOTES_COORDINATOR',
    'BILLING',
    'FINANCE',
  ];
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { bcbaId: true, rbtId: true, caseCoordinatorId: true },
  });
  if (!client) return { ok: false, error: 'Client not found.' };

  // Global client visibility does not waive authoritative resource existence.
  if (roleSeesAllClients.includes(user.role as Role)) return gate;

  const assigned =
    client.bcbaId === user.id || client.rbtId === user.id || client.caseCoordinatorId === user.id;
  if (!assigned) {
    return { ok: false, error: 'You are not assigned to this client.' };
  }
  return gate;
}

export function sanitizePhiData<T extends Record<string, unknown>>(data: T): Partial<T> {
  const sanitized: Record<string, unknown> = { ...data };
  
  // Strip out sensitive PHI fields when sending to Zero-PHI environments
  delete sanitized.medicaidId;
  delete sanitized.memberId;
  delete sanitized.guardianPhone;
  delete sanitized.guardianEmail;
  delete sanitized.parentAddress;
  delete sanitized.treatmentPlan;
  delete sanitized.intakePacket;
  
  return sanitized as Partial<T>;
}
