'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { assertPredecessor } from '@/lib/clientStatusGates';
import { getCurrentUser } from '@/lib/auth';
import {
  requireClientAccess,
  requireStaff,
  CLINICAL_ROLES,
} from '@/lib/auth-guard';
import { clinicWallClockToUtc } from '@/lib/clinicTimezone';
import {
  ASSESSMENT_SCHEDULER_ROLES,
  buildAssignmentAuditRow,
  isPrismaWriteConflict,
  validateAssignmentRequest,
} from '@/lib/assignmentSecurity';
import { writeAuditLog } from '@/lib/auditLog';
import {
  runTreatmentPlanSave,
  type TreatmentPlanSessionUser,
} from './treatment-plan-save';

const ASSESSMENT_SCHEDULE_STALE = 'ASSESSMENT_SCHEDULE_STALE';

function parseTreatmentPlan(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return { ...(raw as Record<string, unknown>) };
  return {};
}

/**
 * Persist a real assessment event (Session CPT 97151) + treatmentPlan.assessmentScheduledAt,
 * then advance ClientStatus to ASSESSMENT_SCHEDULED.
 */
export async function scheduleAssessment(input: {
  clientId: string;
  date: Date | string;
  expectedClientStatus: string;
  expectedBcbaId: string | null;
  reason?: string;
}) {
  const auth = await requireStaff(ASSESSMENT_SCHEDULER_ROLES);
  if (!auth.ok) return { success: false as const, error: auth.error };

  try {
    // datetime-local strings carry no TZ — interpret as clinic wall-clock
    // (America/New_York), not the scheduler's machine TZ. Date instances and
    // zoned ISO strings pass through unchanged.
    const parsed =
      typeof input.date === 'string'
        ? (clinicWallClockToUtc(input.date) ?? new Date(input.date))
        : input.date;

    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
      return { success: false as const, error: 'Valid assessment date/time is required.' };
    }

    const access = await requireClientAccess(input.clientId);
    if (!access.ok) return { success: false as const, error: access.error };

    const scheduledEnd = new Date(parsed.getTime() + 2 * 60 * 60 * 1000);
    const correlationId = crypto.randomUUID();
    const result = await prisma.$transaction(
      async (tx) => {
        const client = await tx.client.findUnique({
          where: { id: input.clientId },
          select: {
            id: true,
            status: true,
            bcbaId: true,
            caseCoordinatorId: true,
            treatmentPlan: true,
          },
        });
        if (!client) throw new Error('CLIENT_NOT_FOUND');

        const target = client.bcbaId
          ? await tx.user.findUnique({
              where: { id: client.bcbaId },
              select: { id: true, role: true, isActive: true },
            })
          : null;
        const policy = validateAssignmentRequest({
          actor: {
            id: auth.user.id,
            role: auth.user.role,
            isActive: auth.user.isActive !== false,
          },
          allowedActorRoles: ASSESSMENT_SCHEDULER_ROLES,
          clientAccessGranted: true,
          requireOwnedClient: false,
          clientCaseCoordinatorId: client.caseCoordinatorId,
          target,
          targetRole: 'BCBA',
          currentAssignmentId: client.bcbaId,
          expectedAssignmentId: input.expectedBcbaId,
          clientStatus: client.status,
          allowedClientStatuses: ['PA_APPROVED', 'ASSESSMENT_SCHEDULED'],
        });
        if (!policy.ok) return { policyError: policy.error } as const;
        if (client.status !== input.expectedClientStatus) {
          return {
            policyError:
              'This client moved to another workflow stage. Refresh and try again.',
          } as const;
        }

        const existing = await tx.session.findFirst({
          where: { clientId: client.id, cptCode: '97151' },
          orderBy: { scheduledStart: 'asc' },
          select: { id: true },
        });
        if (client.status === 'ASSESSMENT_SCHEDULED') {
          return existing
            ? ({ alreadyScheduled: true, sessionId: existing.id } as const)
            : ({
                policyError:
                  'Assessment status is already scheduled but no durable 97151 session exists. Reconcile the client before retrying.',
              } as const);
        }
        if (existing) {
          return {
            policyError:
              'A 97151 assessment session already exists. Refresh before scheduling again.',
          } as const;
        }

        const treatmentPlan = parseTreatmentPlan(client.treatmentPlan);
        treatmentPlan.assessmentScheduledAt = parsed.toISOString();

        const updated = await tx.client.updateMany({
          where: {
            id: client.id,
            status: 'PA_APPROVED',
            bcbaId: input.expectedBcbaId,
          },
          data: {
            status: 'ASSESSMENT_SCHEDULED',
            treatmentPlan: treatmentPlan as Prisma.InputJsonValue,
          },
        });
        if (updated.count !== 1) throw new Error(ASSESSMENT_SCHEDULE_STALE);

        const session = await tx.session.create({
          data: {
            clientId: client.id,
            bcbaId: client.bcbaId,
            status: 'SCHEDULED',
            scheduledStart: parsed,
            scheduledEnd,
            cptCode: '97151',
            location: 'Assessment',
          },
          select: { id: true },
        });
        await tx.auditLogVault.create({
          data: buildAssignmentAuditRow({
            actorUserId: auth.user.id,
            action: 'ASSIGN',
            entityType: 'SESSION_BCBA_ASSIGNMENT',
            entityId: session.id,
            previousId: null,
            nextId: client.bcbaId,
            source: 'ASSESSMENT_SCHEDULER',
            reason: input.reason?.trim() || 'Schedule authorized 97151 assessment',
            correlationId,
          }),
        });

        return { alreadyScheduled: false, sessionId: session.id } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in result) {
      return { success: false as const, error: result.policyError };
    }

    revalidatePath(`/client/${input.clientId}`);
    revalidatePath('/clinical-support');
    return {
      success: true as const,
      alreadyScheduled: result.alreadyScheduled,
      sessionId: result.sessionId,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND') {
      return { success: false as const, error: 'Client not found.' };
    }
    if (
      (error instanceof Error && error.message === ASSESSMENT_SCHEDULE_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'This client or BCBA assignment changed. Refresh and try again.',
      };
    }
    console.error('Failed to schedule assessment:', error instanceof Error ? error.message : error);
    return { success: false as const, error: 'Failed to schedule assessment.' };
  }
}

export async function assembleReport(clientId: string) {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, status: true, treatmentPlan: true },
    });
    if (!client) return { success: false, error: 'Client not found.' };

    const gate = assertPredecessor(
      client.status,
      ['ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED'],
      'REPORT_ASSEMBLED'
    );
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }
    if (gate.alreadyPast && client.status !== 'REPORT_ASSEMBLED') {
      return { success: true };
    }

    const treatmentPlan = parseTreatmentPlan(client.treatmentPlan);
    if (treatmentPlan.status !== 'COMPLETED') {
      return { success: false, error: 'BCBA must submit the Treatment Plan before report assembly.' };
    }
    if (!treatmentPlan.parentSignature) {
      return { success: false, error: 'Parent typed-name signature is required before assembling the report.' };
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'REPORT_ASSEMBLED' },
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/clinical-support');
    return { success: true };
  } catch (error: unknown) {
    console.error('Failed to assemble report:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to assemble report.' };
  }
}

/**
 * Save / submit Treatment Plan JSON.
 * Identity is derived from the active session; browser identity fields are
 * rejected. Expected-current writes prevent stale drafts from replacing a
 * newer final signature.
 * On submit from ASSESSMENT_SCHEDULED: keep status until parent signs + assembleReport.
 */
export async function saveTreatmentPlan(
  clientId: string,
  treatmentPlanData: unknown,
  isSubmit: boolean = false,
  options?: {
    expectedUpdatedAt?: string;
    overrideReason?: string;
  },
) {
  try {
    const result = await runTreatmentPlanSave(
      {
        clientId,
        treatmentPlanData,
        isSubmit,
        expectedUpdatedAt: options?.expectedUpdatedAt,
        overrideReason: options?.overrideReason,
      },
      {
        authenticate: async () => {
          const gate = await requireStaff(CLINICAL_ROLES);
          if (!gate.ok) return gate;
          const user = gate.user;
          const sessionUser: TreatmentPlanSessionUser = {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: String(user.role),
            isActive: user.isActive,
          };
          return { ok: true, user: sessionUser };
        },
        loadClient: async (requestedClientId) => {
          const client = await prisma.client.findUnique({
            where: { id: requestedClientId },
            select: {
              id: true,
              status: true,
              updatedAt: true,
              treatmentPlan: true,
              bcbaId: true,
              // Client.bcba is User? in schema: direct nullable relation.
              bcba: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  role: true,
                  isActive: true,
                },
              },
            },
          });
          if (!client) return null;
          return {
            ...client,
            status: String(client.status),
            bcba: client.bcba
              ? { ...client.bcba, role: String(client.bcba.role) }
              : null,
          };
        },
        updateIfCurrent: async (write) =>
          prisma.$transaction(async (tx) => {
            const expectedTreatmentPlan =
              write.expectedTreatmentPlan === null
                ? Prisma.AnyNull
                : (write.expectedTreatmentPlan as Prisma.InputJsonValue);
            const update = await tx.client.updateMany({
              where: {
                id: write.clientId,
                updatedAt: new Date(write.expectedUpdatedAt),
                status:
                  write.expectedClientStatus as Prisma.ClientWhereInput['status'],
                bcbaId: write.expectedBcbaId,
                treatmentPlan: { equals: expectedTreatmentPlan },
              },
              data: {
                treatmentPlan: write.treatmentPlan as Prisma.InputJsonValue,
                ...(write.nextClientStatus
                  ? { status: write.nextClientStatus }
                  : {}),
              },
            });
            if (update.count !== 1) return null;
            return tx.client.findUnique({
              where: { id: write.clientId },
              select: { updatedAt: true },
            });
          }),
        auditOverride: async (event) => {
          await writeAuditLog({
            actorUserId: event.actorUserId,
            action: 'OVERRIDE',
            entityType: 'TREATMENT_PLAN',
            entityId: event.clientId,
            meta: {
              event: 'TREATMENT_PLAN_FINAL_SIGN_OVERRIDE',
              assignedBcbaId: event.assignedBcbaId,
              overrideReason: event.reason,
            },
          });
        },
        now: () => new Date(),
      },
    );

    if (!result.success) return result;
    revalidatePath(`/client/${clientId}`);
    revalidatePath('/clinical-support');
    return result;
  } catch (error: unknown) {
    console.error(
      'saveTreatmentPlan failed:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return {
      success: false as const,
      code: 'SAVE_FAILED',
      error: 'Failed to save the treatment plan. Please try again.',
    };
  }
}

export async function getGoalTemplates(type?: string) {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return { success: false, error: auth.error };

    const whereClause = type ? { type } : {};
    const templates = await prisma.goalTemplate.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, templates };
  } catch (error: unknown) {
    console.error('Failed to get goal templates:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to load goal templates.' };
  }
}

type GoalTemplatePayload = {
  type?: string;
  domain?: string | null;
  description?: string | null;
  mastery?: string | null;
  behavior?: string | null;
  topography?: string | null;
  function?: string | null;
  antecedent?: string | null;
  consequence?: string | null;
};

export async function saveGoalTemplate(payload: GoalTemplatePayload) {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    const type = payload.type?.trim();
    if (!type || !['SKILL', 'BRP', 'PARENT'].includes(type)) {
      return { success: false, error: 'Invalid goal template type.' };
    }

    // Author is derived from the signed-in user, never trusted from the client
    const user = await getCurrentUser();
    const authorName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
      : null;

    const template = await prisma.goalTemplate.create({
      data: {
        type,
        domain: payload.domain ?? null,
        description: payload.description ?? null,
        mastery: payload.mastery ?? null,
        behavior: payload.behavior ?? null,
        topography: payload.topography ?? null,
        function: payload.function ?? null,
        antecedent: payload.antecedent ?? null,
        consequence: payload.consequence ?? null,
        authorName,
      }
    });
    return { success: true, template };
  } catch (error: unknown) {
    console.error('Failed to save goal template:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to save goal template.' };
  }
}
