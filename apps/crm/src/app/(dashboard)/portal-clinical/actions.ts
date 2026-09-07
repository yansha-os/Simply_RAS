'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { assertPredecessor } from '@/lib/clientStatusGates';
import {
  requireClientAccess,
  requireStaff,
  CLINICAL_ROLES,
} from '@/lib/auth-guard';
import {
  BCBA_ASSIGNMENT_ROLES,
  buildAssignmentAuditRow,
  isPrismaWriteConflict,
  validateAssignmentRequest,
} from '@/lib/assignmentSecurity';
import {
  BCBA_ASSIGN_ELIGIBLE_STATUSES,
} from '@/lib/staffingReadiness';

const BCBA_ASSIGNMENT_STALE = 'BCBA_ASSIGNMENT_STALE';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function approveClinicalDocs(formData: FormData) {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };

    const clientId = String(formData.get('clientId'));
    if (!UUID_PATTERN.test(clientId)) {
      return { success: false, error: 'Missing or invalid clientId.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) return { success: false, error: access.error };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, status: true },
    });
    if (!client) return { success: false, error: 'Client not found.' };

    const gate = assertPredecessor(
      client.status,
      ['DOCS_APPROVED_INTAKE', 'CLINICAL_REVIEW_APPROVED'],
      'CLINICAL_REVIEW_APPROVED'
    );
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }
    if (gate.alreadyPast && client.status !== 'CLINICAL_REVIEW_APPROVED') {
      revalidatePath('/portal-clinical');
      return { success: true };
    }

    const approved = await prisma.client.updateMany({
      where: {
        id: clientId,
        status: client.status,
      },
      data: { status: 'CLINICAL_REVIEW_APPROVED' }
    });
    if (approved.count !== 1) {
      return {
        success: false,
        error: 'The client status changed in another session. Refresh and try again.',
      };
    }

    revalidatePath('/portal-clinical');
    revalidatePath(`/client/${clientId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error('approveClinicalDocs failed:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to approve clinical docs.' };
  }
}

export async function rejectClinicalDocs(formData: FormData) {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };

    const clientId = String(formData.get('clientId') || '');
    if (!clientId) {
      return { success: false, error: 'Missing client.' };
    }

    return {
      success: false,
      error:
        'Full packet bounce to Intake is disabled. Request a correction on the specific document from Clinical Document Verification. The family re-uploads that file and Clinical Support re-reviews it.',
    };
  } catch (error: unknown) {
    console.error('rejectClinicalDocs failed:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to reject clinical docs.' };
  }
}

export async function assignBcba(input: {
  clientId: string;
  bcbaId: string;
  expectedBcbaId: string | null;
  reason?: string;
}) {
  const auth = await requireStaff(BCBA_ASSIGNMENT_ROLES);
  if (!auth.ok) return { success: false as const, error: auth.error };

  try {
    if (
      !input ||
      !UUID_PATTERN.test(input.clientId) ||
      !UUID_PATTERN.test(input.bcbaId) ||
      (input.expectedBcbaId !== null && !UUID_PATTERN.test(input.expectedBcbaId))
    ) {
      return { success: false as const, error: 'Invalid BCBA assignment request.' };
    }

    const access = await requireClientAccess(input.clientId);
    if (!access.ok) return { success: false as const, error: access.error };

    const correlationId = crypto.randomUUID();
    const result = await prisma.$transaction(
      async (tx) => {
        const [client, target] = await Promise.all([
          tx.client.findUnique({
            where: { id: input.clientId },
            select: {
              id: true,
              status: true,
              bcbaId: true,
              caseCoordinatorId: true,
            },
          }),
          tx.user.findUnique({
            where: { id: input.bcbaId },
            select: { id: true, role: true, isActive: true },
          }),
        ]);
        if (!client) throw new Error('CLIENT_NOT_FOUND');

        const policy = validateAssignmentRequest({
          actor: {
            id: auth.user.id,
            role: auth.user.role,
            isActive: auth.user.isActive !== false,
          },
          allowedActorRoles: BCBA_ASSIGNMENT_ROLES,
          clientAccessGranted: true,
          requireOwnedClient: false,
          clientCaseCoordinatorId: client.caseCoordinatorId,
          target,
          targetRole: 'BCBA',
          currentAssignmentId: client.bcbaId,
          expectedAssignmentId: input.expectedBcbaId,
          clientStatus: client.status,
          allowedClientStatuses: BCBA_ASSIGN_ELIGIBLE_STATUSES,
        });
        if (!policy.ok) return { policyError: policy.error } as const;

        if (client.bcbaId === input.bcbaId) {
          return { alreadyAssigned: true } as const;
        }

        const updated = await tx.client.updateMany({
          where: {
            id: input.clientId,
            bcbaId: input.expectedBcbaId,
            status: { in: [...BCBA_ASSIGN_ELIGIBLE_STATUSES] },
          },
          data: { bcbaId: input.bcbaId },
        });
        if (updated.count !== 1) throw new Error(BCBA_ASSIGNMENT_STALE);

        await tx.auditLogVault.create({
          data: buildAssignmentAuditRow({
            actorUserId: auth.user.id,
            action: 'ASSIGN',
            entityType: 'CLIENT_BCBA_ASSIGNMENT',
            entityId: input.clientId,
            previousId: client.bcbaId,
            nextId: input.bcbaId,
            source: 'PORTAL_CLINICAL',
            reason: input.reason?.trim() || 'Clinical leadership BCBA assignment',
            correlationId,
          }),
        });

        return { alreadyAssigned: false } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in result) {
      return { success: false as const, error: result.policyError };
    }

    revalidatePath('/portal-clinical');
    revalidatePath('/portal-clinical/bcbas');
    revalidatePath(`/client/${input.clientId}`);
    return { success: true as const, alreadyAssigned: result.alreadyAssigned };
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND') {
      return { success: false as const, error: 'Client not found.' };
    }
    if (
      (error instanceof Error && error.message === BCBA_ASSIGNMENT_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'This assignment changed in another session. Refresh and try again.',
      };
    }
    console.error(
      'Action failed [assignBcba]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to assign BCBA.' };
  }
}

/**
 * HARD-GATED: free any-status ClientStatus writer neutralized.
 * Use canonical portal-case billing / clinical-support actions for pipeline transitions.
 */
export async function updateTreatmentPlanStatus(clientId: string, status: unknown) {
  void clientId;
  void status;
  return {
    success: false,
    error:
      'Direct ClientStatus writes are disabled. Use scheduleAssessment, saveTreatmentPlan, assembleReport, or billing PA actions.',
  };
}
