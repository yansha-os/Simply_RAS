'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
// Canonical batched fan-out with unread dedupe — do not re-implement locally.
import { notifyUsers } from '@/app/actions/notifications';
import { CLINIC_TIME_ZONE, clinicWallClockToUtc } from '@/lib/clinicTimezone';
import {
  FIRST_SESSION_SCHEDULER_ROLES,
  buildAssignmentAuditRow,
  isIdempotentFirstSessionAssignment,
  isPrismaWriteConflict,
  validateAssignmentRequest,
  validateAssignmentTarget,
  validateExpectedAssignment,
  validateFirstSessionMutationAccess,
} from '@/lib/assignmentSecurity';

const THERAPY_CPT = '97153';
const ASSESSMENT_CPT = '97151';
const FIRST_SESSION_STALE = 'FIRST_SESSION_STALE';
const FIRST_SESSION_COMPLETION_STALE = 'FIRST_SESSION_COMPLETION_STALE';
const FIRST_SESSION_ACTIVATION_STALE = 'FIRST_SESSION_ACTIVATION_STALE';

/**
 * Scheduler-entered `datetime-local` strings carry no TZ; interpret them as
 * clinic wall-clock (America/New_York) regardless of the scheduler's machine
 * TZ. Already-zoned ISO strings pass through unchanged.
 */
function parseScheduleInstant(value: string): Date {
  return clinicWallClockToUtc(value) ?? new Date(value);
}

function isStaffingReady(client: {
  status: string;
  rbtId: string | null;
  bcbaId: string | null;
}) {
  return (
    client.status === 'STAFFING_PENDING' &&
    Boolean(client.rbtId) &&
    Boolean(client.bcbaId)
  );
}

/**
 * Case Coord schedules the first non-97151 therapy Session when staffing is ready.
 * Does NOT set Client.status ACTIVE — that requires activateAfterFirstSession.
 */
export async function scheduleFirstTherapySession(input: {
  clientId: string;
  scheduledStart: string;
  scheduledEnd: string;
  location?: string;
  cptCode?: string;
  expectedClientStatus: string;
  expectedRbtId: string | null;
  expectedBcbaId: string | null;
  expectedRbtApproved: boolean;
  reason?: string;
}) {
  const actorGate = await requireStaff(FIRST_SESSION_SCHEDULER_ROLES);
  if (!actorGate.ok) {
    return { success: false as const, error: actorGate.error };
  }

  try {
    const cpt = (input.cptCode || THERAPY_CPT).trim();
    if (cpt === ASSESSMENT_CPT) {
      return {
        success: false as const,
        error: 'First therapy session cannot use assessment CPT 97151.',
      };
    }

    const start = parseScheduleInstant(input.scheduledStart);
    const end = parseScheduleInstant(input.scheduledEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return { success: false as const, error: 'Invalid session start/end times.' };
    }

    const access = await requireClientAccess(input.clientId);
    if (!access.ok) {
      return { success: false as const, error: access.error };
    }

    const correlationId = crypto.randomUUID();
    const result = await prisma.$transaction(
      async (tx) => {
        const client = await tx.client.findUnique({
          where: { id: input.clientId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            rbtId: true,
            bcbaId: true,
            rbtApproved: true,
            caseCoordinatorId: true,
          },
        });
        if (!client) throw new Error('CLIENT_NOT_FOUND');

        const [rbt, bcba] = await Promise.all([
          client.rbtId
            ? tx.user.findUnique({
                where: { id: client.rbtId },
                select: { id: true, role: true, isActive: true },
              })
            : null,
          client.bcbaId
            ? tx.user.findUnique({
                where: { id: client.bcbaId },
                select: { id: true, role: true, isActive: true },
              })
            : null,
        ]);

        const rbtPolicy = validateAssignmentRequest({
          actor: {
            id: actorGate.user.id,
            role: actorGate.user.role,
            isActive: actorGate.user.isActive !== false,
          },
          allowedActorRoles: FIRST_SESSION_SCHEDULER_ROLES,
          clientAccessGranted: true,
          requireOwnedClient: true,
          clientCaseCoordinatorId: client.caseCoordinatorId,
          target: rbt,
          targetRole: 'RBT',
          currentAssignmentId: client.rbtId,
          expectedAssignmentId: input.expectedRbtId,
          clientStatus: client.status,
          allowedClientStatuses: ['STAFFING_PENDING'],
        });
        if (!rbtPolicy.ok) return { policyError: rbtPolicy.error } as const;

        const bcbaTarget = validateAssignmentTarget(bcba, 'BCBA');
        if (!bcbaTarget.ok) return { policyError: bcbaTarget.error } as const;
        const bcbaExpected = validateExpectedAssignment(
          client.bcbaId,
          input.expectedBcbaId
        );
        if (!bcbaExpected.ok) return { policyError: bcbaExpected.error } as const;
        if (client.status !== input.expectedClientStatus) {
          return {
            policyError:
              'This client moved to another workflow stage. Refresh and try again.',
          } as const;
        }
        if (
          !client.rbtApproved ||
          input.expectedRbtApproved !== client.rbtApproved
        ) {
          return {
            policyError:
              'The selected RBT must still be parent-approved before scheduling.',
          } as const;
        }
        if (!isStaffingReady(client)) {
          return {
            policyError:
              'Staffing is not ready: an approved RBT and active BCBA are required.',
          } as const;
        }

        const existingFirst = await tx.session.findFirst({
          where: {
            clientId: client.id,
            cptCode: { not: ASSESSMENT_CPT },
            status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
          },
          orderBy: { scheduledStart: 'asc' },
          select: {
            id: true,
            clientId: true,
            rbtId: true,
            bcbaId: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            cptCode: true,
            location: true,
          },
        });
        if (existingFirst) {
          if (
            isIdempotentFirstSessionAssignment(
              existingFirst,
              client.rbtId,
              client.bcbaId
            )
          ) {
            return {
              alreadyScheduled: true,
              client,
              session: existingFirst,
            } as const;
          }
          return {
            policyError:
              'A first therapy session already exists with different staff. Refresh and reconcile it before retrying.',
          } as const;
        }

        const claimed = await tx.client.updateMany({
          where: {
            id: client.id,
            status: 'STAFFING_PENDING',
            rbtId: input.expectedRbtId,
            bcbaId: input.expectedBcbaId,
            rbtApproved: input.expectedRbtApproved,
            caseCoordinatorId: client.caseCoordinatorId,
          },
          data: { rbtId: client.rbtId },
        });
        if (claimed.count !== 1) throw new Error(FIRST_SESSION_STALE);

        const session = await tx.session.create({
          data: {
            clientId: client.id,
            rbtId: client.rbtId,
            bcbaId: client.bcbaId,
            status: 'SCHEDULED',
            scheduledStart: start,
            scheduledEnd: end,
            cptCode: cpt,
            location: input.location?.trim() || '12 - Home',
          },
        });
        await tx.auditLogVault.createMany({
          data: [
            buildAssignmentAuditRow({
              actorUserId: actorGate.user.id,
              action: 'ASSIGN',
              entityType: 'SESSION_RBT_ASSIGNMENT',
              entityId: session.id,
              previousId: null,
              nextId: client.rbtId,
              source: 'FIRST_SESSION_SCHEDULER',
              reason: input.reason?.trim() || 'Schedule first approved therapy session',
              correlationId,
            }),
            buildAssignmentAuditRow({
              actorUserId: actorGate.user.id,
              action: 'ASSIGN',
              entityType: 'SESSION_BCBA_ASSIGNMENT',
              entityId: session.id,
              previousId: null,
              nextId: client.bcbaId,
              source: 'FIRST_SESSION_SCHEDULER',
              reason: input.reason?.trim() || 'Schedule first approved therapy session',
              correlationId,
            }),
          ],
        });

        return { alreadyScheduled: false, client, session } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in result) {
      return { success: false as const, error: result.policyError };
    }

    if (!result.alreadyScheduled) {
      const notifyIds = [
        result.client.rbtId,
        result.client.bcbaId,
        result.client.caseCoordinatorId,
      ].filter(Boolean) as string[];
      await notifyUsers({
        userIds: notifyIds,
        title: 'First therapy session scheduled',
        message: `${result.client.firstName} ${result.client.lastName}: ${cpt} on ${start.toLocaleString('en-US', { timeZone: CLINIC_TIME_ZONE })} ET.`,
        type: 'FIRST_SESSION_SCHEDULED',
        // HRM RBT portal path — CRM and HRM share Notification rows; RBT opens HRM :3001
        linkUrl: `/rbt/schedule`,
      });
    }

    revalidatePath('/', 'layout');
    revalidatePath(`/client/${input.clientId}`);
    revalidatePath('/case');
    revalidatePath('/portal-case-coord');
    // Cross-app note: revalidatePath only affects this CRM Next process.
    // HRM /rbt/schedule loads via listRbtScheduledSessions on mount/focus/Refresh — no CRM cache bridge.

    return {
      success: true as const,
      sessionId: result.session.id,
      isFirstTherapySession: true,
      alreadyScheduled: result.alreadyScheduled,
      data: result.session,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND') {
      return { success: false as const, error: 'Client not found.' };
    }
    if (
      (error instanceof Error && error.message === FIRST_SESSION_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'The client assignment changed. Refresh and try again.',
      };
    }
    console.error(
      'Action failed [scheduleFirstTherapySession]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to schedule first therapy session.' };
  }
}

/**
 * Mark a scheduled therapy session COMPLETED (confirm rendered).
 * Optionally used before activate-after-first-session.
 */
export async function confirmTherapySessionCompleted(sessionId: string) {
  const actorGate = await requireStaff(FIRST_SESSION_SCHEDULER_ROLES);
  if (!actorGate.ok) {
    return { success: false as const, error: actorGate.error };
  }

  try {
    const scopedSession = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { clientId: true },
    });
    if (!scopedSession) {
      return { success: false as const, error: 'Session not found.' };
    }

    const access = await requireClientAccess(scopedSession.clientId);
    if (!access.ok) {
      return { success: false as const, error: access.error };
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const session = await tx.session.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            clientId: true,
            status: true,
            cptCode: true,
            scheduledStart: true,
            scheduledEnd: true,
            actualStart: true,
            actualEnd: true,
            client: { select: { caseCoordinatorId: true } },
          },
        });
        if (!session) throw new Error('SESSION_NOT_FOUND');

        const policy = validateFirstSessionMutationAccess({
          actor: {
            id: actorGate.user.id,
            role: actorGate.user.role,
            isActive: actorGate.user.isActive !== false,
          },
          clientAccessGranted: true,
          clientCaseCoordinatorId: session.client.caseCoordinatorId,
        });
        if (!policy.ok) return { policyError: policy.error } as const;

        if (session.cptCode === ASSESSMENT_CPT) {
          return {
            policyError: 'Assessment sessions cannot activate the client.',
          } as const;
        }
        if (session.status === 'COMPLETED') {
          return { alreadyCompleted: true, session } as const;
        }
        if (!['SCHEDULED', 'IN_PROGRESS'].includes(session.status)) {
          return {
            policyError: `A ${session.status} session cannot be marked completed.`,
          } as const;
        }

        const updated = await tx.session.updateMany({
          where: {
            id: session.id,
            clientId: session.clientId,
            status: session.status,
            cptCode: session.cptCode,
          },
          data: {
            status: 'COMPLETED',
            actualStart: session.actualStart || session.scheduledStart,
            actualEnd: session.actualEnd || session.scheduledEnd,
          },
        });
        if (updated.count !== 1) throw new Error(FIRST_SESSION_COMPLETION_STALE);

        return {
          alreadyCompleted: false,
          session: {
            ...session,
            status: 'COMPLETED' as const,
            actualStart: session.actualStart || session.scheduledStart,
            actualEnd: session.actualEnd || session.scheduledEnd,
          },
        } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in result) {
      return { success: false as const, error: result.policyError };
    }

    revalidatePath('/', 'layout');
    revalidatePath(`/client/${result.session.clientId}`);
    revalidatePath('/case');

    return {
      success: true as const,
      alreadyCompleted: result.alreadyCompleted,
      data: result.session,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      return { success: false as const, error: 'Session not found.' };
    }
    if (
      (error instanceof Error && error.message === FIRST_SESSION_COMPLETION_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'The session changed in another workflow. Refresh and try again.',
      };
    }
    console.error(
      'Action failed [confirmTherapySessionCompleted]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to confirm session.' };
  }
}

/**
 * Explicit activate-after-first-session: requires a durable non-97151 Session
 * (SCHEDULED or COMPLETED). Job-board accept alone never reaches here.
 */
export async function activateClientAfterFirstSession(clientId: string) {
  const actorGate = await requireStaff(FIRST_SESSION_SCHEDULER_ROLES);
  if (!actorGate.ok) {
    return { success: false as const, error: actorGate.error };
  }

  try {
    const access = await requireClientAccess(clientId);
    if (!access.ok) {
      return { success: false as const, error: access.error };
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const client = await tx.client.findUnique({
          where: { id: clientId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            rbtId: true,
            bcbaId: true,
            rbtApproved: true,
            caseCoordinatorId: true,
          },
        });
        if (!client) throw new Error('CLIENT_NOT_FOUND');

        const policy = validateFirstSessionMutationAccess({
          actor: {
            id: actorGate.user.id,
            role: actorGate.user.role,
            isActive: actorGate.user.isActive !== false,
          },
          clientAccessGranted: true,
          clientCaseCoordinatorId: client.caseCoordinatorId,
        });
        if (!policy.ok) return { policyError: policy.error } as const;

        if (client.status === 'ACTIVE') {
          return {
            alreadyActive: true,
            client,
            firstSession: null,
          } as const;
        }
        if (client.status !== 'STAFFING_PENDING') {
          return {
            policyError: 'Client must be STAFFING_PENDING to activate after first session.',
          } as const;
        }
        if (!client.rbtId || !client.bcbaId || !client.rbtApproved) {
          return {
            policyError:
              'A parent-approved RBT and active BCBA must remain assigned before activation.',
          } as const;
        }

        const [rbt, bcba] = await Promise.all([
          tx.user.findUnique({
            where: { id: client.rbtId },
            select: { id: true, role: true, isActive: true },
          }),
          tx.user.findUnique({
            where: { id: client.bcbaId },
            select: { id: true, role: true, isActive: true },
          }),
        ]);
        const rbtTarget = validateAssignmentTarget(rbt, 'RBT');
        if (!rbtTarget.ok) return { policyError: rbtTarget.error } as const;
        const bcbaTarget = validateAssignmentTarget(bcba, 'BCBA');
        if (!bcbaTarget.ok) return { policyError: bcbaTarget.error } as const;

        const firstSession = await tx.session.findFirst({
          where: {
            clientId,
            rbtId: client.rbtId,
            bcbaId: client.bcbaId,
            cptCode: { not: ASSESSMENT_CPT },
            status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
          },
          orderBy: { scheduledStart: 'asc' },
          select: { id: true, status: true, cptCode: true, scheduledStart: true },
        });
        if (!firstSession) {
          return {
            policyError:
              'Cannot activate: no therapy Session on record. Schedule the first non-97151 session first.',
          } as const;
        }

        const activated = await tx.client.updateMany({
          where: {
            id: client.id,
            status: 'STAFFING_PENDING',
            rbtId: client.rbtId,
            bcbaId: client.bcbaId,
            rbtApproved: true,
            caseCoordinatorId: client.caseCoordinatorId,
          },
          data: { status: 'ACTIVE' },
        });
        if (activated.count !== 1) throw new Error(FIRST_SESSION_ACTIVATION_STALE);

        return { alreadyActive: false, client, firstSession } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in result) {
      return { success: false as const, error: result.policyError };
    }
    if (result.alreadyActive) {
      return { success: true as const, alreadyActive: true };
    }

    const notifyIds = [
      result.client.rbtId,
      result.client.bcbaId,
      result.client.caseCoordinatorId,
    ].filter(
      Boolean
    ) as string[];
    await notifyUsers({
      userIds: notifyIds,
      title: 'Client activated',
      message: `${result.client.firstName} ${result.client.lastName} is ACTIVE after first therapy session.`,
      type: 'CLIENT_ACTIVE',
      linkUrl: `/client/${clientId}`,
    });

    revalidatePath('/', 'layout');
    revalidatePath(`/client/${clientId}`);
    revalidatePath('/case');
    revalidatePath('/portal-case-coord');

    return {
      success: true as const,
      sessionId: result.firstSession.id,
      data: { clientId, status: 'ACTIVE' as const },
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND') {
      return { success: false as const, error: 'Client not found.' };
    }
    if (
      (error instanceof Error && error.message === FIRST_SESSION_ACTIVATION_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'The client staffing state changed. Refresh and try again.',
      };
    }
    console.error(
      'Action failed [activateClientAfterFirstSession]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to activate client after first session.' };
  }
}

export async function getClientTherapySessions(clientId: string) {
  try {
    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false as const, sessions: [], error: gate.error };

    const sessions = await prisma.session.findMany({
      where: {
        clientId,
        cptCode: { not: ASSESSMENT_CPT },
      },
      include: {
        rbt: { select: { id: true, firstName: true, lastName: true } },
        bcba: { select: { id: true, firstName: true, lastName: true } },
        note: {
          select: {
            id: true,
            rbtSigned: true,
            parentSigned: true,
            bcbaSigned: true,
            isConverted: true,
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });
    return { success: true as const, sessions };
  } catch (error) {
    console.error(
      'Action failed [getClientTherapySessions]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, sessions: [], error: 'Failed to load sessions.' };
  }
}
