import type { Role } from '@repo/db';

export type AssignmentSecurityResult = { ok: true } | { ok: false; error: string };

export type AssignmentActor = {
  id: string;
  role: Role | string;
  isActive: boolean;
};

export type AssignmentTarget = {
  id: string;
  role: Role | string;
  isActive: boolean;
};

export const BCBA_ASSIGNMENT_ROLES: readonly Role[] = [
  'CEO',
  'CLINICAL_DIRECTOR',
  'OPS_DIRECTOR',
];

export const CASE_OPENING_MANAGER_ROLES: readonly Role[] = [
  'CEO',
  'CLINICAL_DIRECTOR',
  'OPS_DIRECTOR',
  'CASE_COORDINATOR',
];

export const FIRST_SESSION_SCHEDULER_ROLES = CASE_OPENING_MANAGER_ROLES;

export const ASSESSMENT_SCHEDULER_ROLES: readonly Role[] = [
  'CEO',
  'CLINICAL_DIRECTOR',
  'OPS_DIRECTOR',
  'BCBA',
  'CLINICAL_SUPPORT',
];

const GLOBAL_ASSIGNMENT_ROLES: readonly Role[] = [
  'CEO',
  'CLINICAL_DIRECTOR',
  'OPS_DIRECTOR',
];

export function validateOwnedClientScope(
  actor: AssignmentActor,
  clientCaseCoordinatorId: string | null,
  allowUnassignedClaim = false
): AssignmentSecurityResult {
  if (GLOBAL_ASSIGNMENT_ROLES.includes(actor.role as Role)) {
    return { ok: true };
  }
  if (
    actor.role === 'CASE_COORDINATOR' &&
    (clientCaseCoordinatorId === actor.id ||
      (allowUnassignedClaim && clientCaseCoordinatorId === null))
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    error: 'You may only manage assignment workflows for your own client.',
  };
}

export function validateFirstSessionMutationAccess(input: {
  actor: AssignmentActor;
  clientAccessGranted: boolean;
  clientCaseCoordinatorId: string | null;
}): AssignmentSecurityResult {
  if (
    !input.actor.isActive ||
    !FIRST_SESSION_SCHEDULER_ROLES.includes(input.actor.role as Role)
  ) {
    return {
      ok: false,
      error: 'You are not authorized to manage first-session activation.',
    };
  }
  if (!input.clientAccessGranted) {
    return {
      ok: false,
      error: 'You do not have access to this client.',
    };
  }
  return validateOwnedClientScope(input.actor, input.clientCaseCoordinatorId);
}

export function validateAssignmentTarget(
  target: AssignmentTarget | null,
  expectedRole: Role
): AssignmentSecurityResult {
  if (!target || !target.isActive || target.role !== expectedRole) {
    return { ok: false, error: `Select an active ${expectedRole}.` };
  }
  return { ok: true };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildAssignmentAuditRow(input: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousId: string | null;
  nextId: string | null;
  source: string;
  reason: string;
  correlationId: string;
}) {
  const actorIsUuid = UUID_PATTERN.test(input.actorUserId);
  return {
    userId: actorIsUuid ? input.actorUserId : null,
    action: input.action,
    resourceType: input.entityType,
    resourceId: input.entityId,
    metadata: {
      ...(!actorIsUuid ? { actorLabel: input.actorUserId } : {}),
      previousId: input.previousId,
      nextId: input.nextId,
      source: input.source,
      reason: input.reason,
      correlationId: input.correlationId,
    },
  };
}

export function validateExpectedAssignment(
  currentAssignmentId: string | null,
  expectedAssignmentId: string | null
): AssignmentSecurityResult {
  if (currentAssignmentId !== expectedAssignmentId) {
    return {
      ok: false,
      error: 'This assignment changed in another session. Refresh and try again.',
    };
  }
  return { ok: true };
}

export function validateAssignmentStatus(
  clientStatus: string,
  allowedClientStatuses: readonly string[],
  operationLabel: string
): AssignmentSecurityResult {
  if (clientStatus === 'DISCHARGED' || !allowedClientStatuses.includes(clientStatus)) {
    return {
      ok: false,
      error: `${operationLabel} is not allowed while the client is ${clientStatus}.`,
    };
  }
  return { ok: true };
}

export function validateAssignmentRequest(input: {
  actor: AssignmentActor;
  allowedActorRoles: readonly Role[];
  clientAccessGranted: boolean;
  requireOwnedClient: boolean;
  allowUnassignedClaim?: boolean;
  clientCaseCoordinatorId: string | null;
  target: AssignmentTarget | null;
  targetRole: Role;
  currentAssignmentId: string | null;
  expectedAssignmentId: string | null;
  clientStatus: string;
  allowedClientStatuses: readonly string[];
}): AssignmentSecurityResult {
  if (
    !input.actor.isActive ||
    !input.allowedActorRoles.includes(input.actor.role as Role)
  ) {
    return {
      ok: false,
      error: 'You are not authorized to perform this assignment.',
    };
  }
  if (!input.clientAccessGranted) {
    return {
      ok: false,
      error: 'You do not have access to this client.',
    };
  }
  if (input.requireOwnedClient) {
    const scope = validateOwnedClientScope(
      input.actor,
      input.clientCaseCoordinatorId,
      input.allowUnassignedClaim
    );
    if (!scope.ok) return scope;
  }

  const target = validateAssignmentTarget(input.target, input.targetRole);
  if (!target.ok) return target;

  const expected = validateExpectedAssignment(
    input.currentAssignmentId,
    input.expectedAssignmentId
  );
  if (!expected.ok) return expected;

  const status = validateAssignmentStatus(
    input.clientStatus,
    input.allowedClientStatuses,
    `${input.targetRole} assignment`
  );
  if (!status.ok) return status;

  return { ok: true };
}

const CASE_APPLICATION_TRANSITIONS: Record<string, readonly string[]> = {
  APPLIED: ['MESSAGING', 'MEET_SCHEDULED', 'REJECTED', 'WITHDRAWN'],
  MESSAGING: ['MEET_SCHEDULED', 'REJECTED', 'WITHDRAWN'],
  MEET_SCHEDULED: ['PARENT_PENDING', 'REJECTED', 'WITHDRAWN'],
  PARENT_PENDING: ['REJECTED'],
};

export function validateExpectedCaseApplicationStatus(
  currentStatus: string,
  expectedStatus: string
): AssignmentSecurityResult {
  if (currentStatus !== expectedStatus) {
    return {
      ok: false,
      error: 'The application changed in another session. Refresh and try again.',
    };
  }
  return { ok: true };
}

export function validateCaseApplicationTransition(
  currentStatus: string,
  nextStatus: string
): AssignmentSecurityResult {
  if (currentStatus === nextStatus && currentStatus in CASE_APPLICATION_TRANSITIONS) {
    return { ok: true };
  }
  if (CASE_APPLICATION_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: `Application cannot move from ${currentStatus} to ${nextStatus}.`,
  };
}

export function isIdempotentParentAcceptance(input: {
  applicationStatus: string;
  openingStatus: string;
  clientRbtId: string | null;
  applicantRbtId: string;
  rbtApproved: boolean;
}): boolean {
  return (
    input.applicationStatus === 'APPROVED' &&
    input.openingStatus === 'FILLED' &&
    input.clientRbtId === input.applicantRbtId &&
    input.rbtApproved
  );
}

export function isIdempotentFirstSessionAssignment(
  session: { rbtId: string | null; bcbaId: string | null },
  expectedRbtId: string | null,
  expectedBcbaId: string | null
): boolean {
  return (
    session.rbtId === expectedRbtId &&
    session.bcbaId === expectedBcbaId
  );
}

export function isPrismaWriteConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}
