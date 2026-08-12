import { describe, expect, it } from 'vitest';

import {
  BCBA_ASSIGNMENT_ROLES,
  CASE_OPENING_MANAGER_ROLES,
  FIRST_SESSION_SCHEDULER_ROLES,
  buildAssignmentAuditRow,
  isIdempotentFirstSessionAssignment,
  isIdempotentParentAcceptance,
  isPrismaWriteConflict,
  validateAssignmentRequest,
  validateAssignmentStatus,
  validateAssignmentTarget,
  validateCaseApplicationTransition,
  validateExpectedCaseApplicationStatus,
  validateExpectedAssignment,
  validateFirstSessionMutationAccess,
  validateOwnedClientScope,
} from '../assignmentSecurity';

const actor = {
  id: 'actor-1',
  role: 'CASE_COORDINATOR',
  isActive: true,
} as const;

const activeRbt = {
  id: 'rbt-1',
  role: 'RBT',
  isActive: true,
} as const;

describe('assignment actor and resource authorization', () => {
  it('rejects a role outside the operation allowlist', () => {
    const result = validateAssignmentRequest({
      actor: { id: 'rbt-actor', role: 'RBT', isActive: true },
      allowedActorRoles: BCBA_ASSIGNMENT_ROLES,
      clientAccessGranted: true,
      requireOwnedClient: false,
      clientCaseCoordinatorId: null,
      target: { id: 'bcba-1', role: 'BCBA', isActive: true },
      targetRole: 'BCBA',
      currentAssignmentId: null,
      expectedAssignmentId: null,
      clientStatus: 'PA_APPROVED',
      allowedClientStatuses: ['PA_APPROVED'],
    });

    expect(result).toEqual({
      ok: false,
      error: 'You are not authorized to perform this assignment.',
    });
  });

  it('rejects a cross-client identifier even for an otherwise allowed actor', () => {
    const result = validateAssignmentRequest({
      actor,
      allowedActorRoles: CASE_OPENING_MANAGER_ROLES,
      clientAccessGranted: false,
      requireOwnedClient: true,
      clientCaseCoordinatorId: actor.id,
      target: activeRbt,
      targetRole: 'RBT',
      currentAssignmentId: null,
      expectedAssignmentId: null,
      clientStatus: 'STAFFING_PENDING',
      allowedClientStatuses: ['STAFFING_PENDING'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('client');
  });

  it('requires an ordinary coordinator to own the client', () => {
    const result = validateOwnedClientScope(actor, 'different-coordinator');

    expect(result.ok).toBe(false);
  });

  it('rejects first-session completion from a non-operational role', () => {
    const result = validateFirstSessionMutationAccess({
      actor: { id: 'rbt-actor', role: 'RBT', isActive: true },
      clientAccessGranted: true,
      clientCaseCoordinatorId: actor.id,
    });

    expect(result).toEqual({
      ok: false,
      error: 'You are not authorized to manage first-session activation.',
    });
  });

  it('rejects first-session completion for a client outside the caller scope', () => {
    const result = validateFirstSessionMutationAccess({
      actor,
      clientAccessGranted: false,
      clientCaseCoordinatorId: actor.id,
    });

    expect(result).toEqual({
      ok: false,
      error: 'You do not have access to this client.',
    });
  });

  it('preserves the owned coordinator first-session path', () => {
    expect(
      validateFirstSessionMutationAccess({
        actor,
        clientAccessGranted: true,
        clientCaseCoordinatorId: actor.id,
      })
    ).toEqual({ ok: true });
  });
});

describe('assignment target validation', () => {
  it('rejects inactive target staff', () => {
    expect(
      validateAssignmentTarget({ ...activeRbt, isActive: false }, 'RBT')
    ).toEqual({
      ok: false,
      error: 'Select an active RBT.',
    });
  });

  it('rejects target staff with the wrong role', () => {
    expect(
      validateAssignmentTarget({ ...activeRbt, role: 'BCBA' }, 'RBT')
    ).toEqual({
      ok: false,
      error: 'Select an active RBT.',
    });
  });
});

describe('assignment concurrency and status gates', () => {
  it('rejects a stale expected assignment', () => {
    expect(validateExpectedAssignment('rbt-new', 'rbt-old')).toEqual({
      ok: false,
      error: 'This assignment changed in another session. Refresh and try again.',
    });
  });

  it('blocks status-gate skips and never permits DISCHARGED', () => {
    expect(
      validateAssignmentStatus('PA_APPROVED', ['STAFFING_PENDING'], 'RBT assignment').ok
    ).toBe(false);
    expect(
      validateAssignmentStatus(
        'DISCHARGED',
        ['STAFFING_PENDING', 'ACTIVE', 'DISCHARGED'],
        'RBT assignment'
      ).ok
    ).toBe(false);
  });

  it('accepts the complete valid first-session assignment path', () => {
    const result = validateAssignmentRequest({
      actor,
      allowedActorRoles: FIRST_SESSION_SCHEDULER_ROLES,
      clientAccessGranted: true,
      requireOwnedClient: true,
      clientCaseCoordinatorId: actor.id,
      target: activeRbt,
      targetRole: 'RBT',
      currentAssignmentId: activeRbt.id,
      expectedAssignmentId: activeRbt.id,
      clientStatus: 'STAFFING_PENDING',
      allowedClientStatuses: ['STAFFING_PENDING'],
    });

    expect(result).toEqual({ ok: true });
  });
});

describe('assignment audit rows', () => {
  it('records actor, previous/next values, source, reason, and correlation id without PHI', () => {
    expect(
      buildAssignmentAuditRow({
        actorUserId: 'dev-actor',
        action: 'ASSIGN',
        entityType: 'CLIENT_ASSIGNMENT',
        entityId: 'client-1',
        previousId: null,
        nextId: 'rbt-1',
        source: 'CASE_OPENING_PARENT_ACCEPT',
        reason: 'Parent confirmed after meet and greet',
        correlationId: 'correlation-1',
      })
    ).toEqual({
      userId: null,
      action: 'ASSIGN',
      resourceType: 'CLIENT_ASSIGNMENT',
      resourceId: 'client-1',
      metadata: {
        actorLabel: 'dev-actor',
        previousId: null,
        nextId: 'rbt-1',
        source: 'CASE_OPENING_PARENT_ACCEPT',
        reason: 'Parent confirmed after meet and greet',
        correlationId: 'correlation-1',
      },
    });
  });
});

describe('case application selection transitions', () => {
  it('rejects a stale expected application status before a meet transition', () => {
    expect(
      validateExpectedCaseApplicationStatus('MESSAGING', 'APPLIED')
    ).toEqual({
      ok: false,
      error: 'The application changed in another session. Refresh and try again.',
    });
  });

  it('preserves a current meet-scheduling transition', () => {
    expect(
      validateExpectedCaseApplicationStatus('MESSAGING', 'MESSAGING')
    ).toEqual({ ok: true });
    expect(
      validateCaseApplicationTransition('MESSAGING', 'MEET_SCHEDULED')
    ).toEqual({ ok: true });
  });

  it('does not let a generic status write skip directly to parent selection', () => {
    expect(validateCaseApplicationTransition('APPLIED', 'PARENT_PENDING').ok).toBe(
      false
    );
  });

  it('allows the reviewed meet-and-greet candidate to enter parent decision', () => {
    expect(
      validateCaseApplicationTransition('MEET_SCHEDULED', 'PARENT_PENDING')
    ).toEqual({ ok: true });
  });

  it('does not rewrite a terminal application', () => {
    expect(validateCaseApplicationTransition('APPROVED', 'REJECTED').ok).toBe(
      false
    );
  });
});

describe('approved workflow idempotency', () => {
  it('recognizes only the fully consistent parent-accept state', () => {
    expect(
      isIdempotentParentAcceptance({
        applicationStatus: 'APPROVED',
        openingStatus: 'FILLED',
        clientRbtId: 'rbt-1',
        applicantRbtId: 'rbt-1',
        rbtApproved: true,
      })
    ).toBe(true);
    expect(
      isIdempotentParentAcceptance({
        applicationStatus: 'APPROVED',
        openingStatus: 'FILLED',
        clientRbtId: 'rbt-2',
        applicantRbtId: 'rbt-1',
        rbtApproved: true,
      })
    ).toBe(false);
  });

  it('reuses a first session only when both persisted clinicians still match', () => {
    expect(
      isIdempotentFirstSessionAssignment(
        { rbtId: 'rbt-1', bcbaId: 'bcba-1' },
        'rbt-1',
        'bcba-1'
      )
    ).toBe(true);
    expect(
      isIdempotentFirstSessionAssignment(
        { rbtId: 'rbt-2', bcbaId: 'bcba-1' },
        'rbt-1',
        'bcba-1'
      )
    ).toBe(false);
  });
});

describe('database conflict classification', () => {
  it('classifies Prisma serializable/deadlock retries as stale-write conflicts', () => {
    expect(isPrismaWriteConflict({ code: 'P2034' })).toBe(true);
    expect(isPrismaWriteConflict(new Error('other'))).toBe(false);
  });
});
