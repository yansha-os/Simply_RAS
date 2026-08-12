'use server';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  requireParentPacketAccess,
  requireStaffOrParent,
} from '@/lib/magicLinkGuard';
import { writeAuditLog } from '@/lib/auditLog';
import {
  resolveExpectedGuardianName,
  validateParentTreatmentPlanSign,
} from '@/lib/parentTreatmentPlanSign';
import { notifyUsers } from '@/app/actions/notifications';

type ClientSchedule = Record<string, { start: string; end: string } | null>;

type StaffingPreferences = {
  gender: string;
  race: string;
  age: string;
  language: string;
  notes: string;
};

/**
 * Intake bell audience: the client's Case Coordinator when assigned, else the
 * active intake team (INTAKE_PA_COORDINATOR). Parent actors have no bell, so
 * these events would otherwise sit unseen until someone opens the profile.
 */
async function resolveIntakeRecipients(caseCoordinatorId: string | null | undefined) {
  if (caseCoordinatorId) return [caseCoordinatorId];
  const intakeTeam = await prisma.user.findMany({
    where: { role: 'INTAKE_PA_COORDINATOR', isActive: true },
    select: { id: true },
    take: 20,
  });
  return intakeTeam.map((u) => u.id);
}

export async function saveIntakeProgress(
  packetId: string,
  formData: Prisma.InputJsonObject
) {
  try {
    const gate = await requireStaffOrParent({ packetId });
    if (!gate.ok) return { success: false, error: gate.error };

    await prisma.intakePacket.update({
      where: { id: packetId },
      data: {
        formData: JSON.stringify(formData)
      }
    });
    return { success: true };
  } catch (e) {
    console.error("Failed to save intake progress:", e instanceof Error ? e.message : e);
    return { success: false, error: 'Failed to save intake progress. Please try again.' };
  }
}

/** INTAKE_FORMS_SUBMITTED once BOTH intake + consent forms are complete (best-effort). */
async function notifyIntakeFormsComplete(packet: {
  clientId: string;
  intakeFormComplete: boolean;
  consentFormComplete: boolean;
}) {
  try {
    if (!packet.intakeFormComplete || !packet.consentFormComplete) return;
    const client = await prisma.client.findUnique({
      where: { id: packet.clientId },
      select: { firstName: true, lastName: true, caseCoordinatorId: true },
    });
    if (!client) return;

    await notifyUsers({
      userIds: await resolveIntakeRecipients(client.caseCoordinatorId),
      title: `Intake forms submitted · ${client.firstName} ${client.lastName}`,
      message: `${client.firstName} ${client.lastName}: intake + consent forms are complete — review documents and advance intake.`,
      type: 'INTAKE_FORMS_SUBMITTED',
      linkUrl: `/client/${packet.clientId}`,
      // A resubmission within a day shouldn't re-ping
      dedupeHours: 24,
    });
  } catch (notifyErr) {
    console.error(
      'intake forms notify failed:',
      notifyErr instanceof Error ? notifyErr.message : 'Unknown'
    );
  }
}

export async function submitForm01(
  packetId: string,
  formData: Prisma.InputJsonObject
) {
  try {
    const gate = await requireStaffOrParent({ packetId });
    if (!gate.ok) return { success: false, error: gate.error };

    const packet = await prisma.intakePacket.update({
      where: { id: packetId },
      data: {
        formData: JSON.stringify(formData),
        intakeFormComplete: true
      }
    });
    await notifyIntakeFormsComplete(packet);
    return { success: true };
  } catch (e) {
    console.error("Failed to submit intake form:", e instanceof Error ? e.message : e);
    return { success: false, error: 'Failed to submit intake form. Please try again.' };
  }
}

export async function submitForm02(
  packetId: string,
  formData: Prisma.InputJsonObject
) {
  try {
    const gate = await requireStaffOrParent({ packetId });
    if (!gate.ok) return { success: false, error: gate.error };

    const packet = await prisma.intakePacket.update({
      where: { id: packetId },
      data: {
        formData: JSON.stringify(formData),
        consentFormComplete: true
      }
    });
    await notifyIntakeFormsComplete(packet);
    return { success: true };
  } catch (e) {
    console.error("Failed to submit consent form:", e instanceof Error ? e.message : e);
    return { success: false, error: 'Failed to submit consent form. Please try again.' };
  }
}

export async function requestClientChanges(token: string, notes: string) {
  const gate = await requireStaffOrParent({ token });
  if (!gate.ok) return { error: gate.error };

  const packet = await prisma.intakePacket.findUnique({
    where: { magicLinkToken: token }
  });

  if (!packet) return { error: "Packet not found" };

  await prisma.intakePacket.update({
    where: { magicLinkToken: token },
    data: {
      clientChangeRequested: true,
      clientChangeNotes: notes
    }
  });

  // INTAKE_CHANGES_REQUESTED → intake staff: parent asked to edit submitted info;
  // the flag only shows inside IntakeDocumentsTab, so surface it on the bell too.
  try {
    const client = await prisma.client.findUnique({
      where: { id: packet.clientId },
      select: { firstName: true, lastName: true, caseCoordinatorId: true },
    });
    if (client) {
      await notifyUsers({
        userIds: await resolveIntakeRecipients(client.caseCoordinatorId),
        title: `Parent requested changes · ${client.firstName} ${client.lastName}`,
        message: `${client.firstName} ${client.lastName}'s parent asked to update their intake info: ${notes.slice(0, 140)}`,
        type: 'INTAKE_CHANGES_REQUESTED',
        linkUrl: `/client/${packet.clientId}`,
        dedupeHours: 0,
      });
    }
  } catch (notifyErr) {
    console.error(
      'requestClientChanges notify failed:',
      notifyErr instanceof Error ? notifyErr.message : 'Unknown'
    );
  }

  revalidatePath('/magic-link/[id]', 'page');
  return { success: true };
}

/**
 * Parent magic-link typed-name e-sign only.
 * Staff must use BCBA/leadership sign paths — not this control.
 * Does not skip to REPORT_ASSEMBLED — Clinical Support assembles.
 */
export async function signTreatmentPlan(
  clientId: string,
  parentSignatureName: string,
  options?: { planReviewed?: boolean }
) {
  try {
    // Parent packet gate only — staff sessions cannot use the parent typed-name signer.
    const gate = await requireParentPacketAccess({ clientId });
    if (!gate.ok) return { success: false, error: gate.error };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        status: true,
        treatmentPlan: true,
        guardianName: true,
        // 1:1 — never treat as array
        intakePacket: { select: { id: true, formData: true, magicLinkToken: true } },
      },
    });
    if (!client) return { success: false, error: 'Client not found' };
    if (client.intakePacket && client.intakePacket.id !== gate.packetId) {
      return { success: false, error: 'Could not verify portal access.' };
    }

    const expectedGuardianName = resolveExpectedGuardianName({
      guardianName: client.guardianName,
      formData: client.intakePacket?.formData,
    });

    const validated = validateParentTreatmentPlanSign({
      parentSignatureName,
      planReviewed: options?.planReviewed === true,
      expectedGuardianName,
    });
    if (!validated.ok) {
      return { success: false, error: validated.error, code: validated.code };
    }

    const signedAt = new Date().toISOString();
    const treatmentPlan: Record<string, Prisma.InputJsonValue> = client.treatmentPlan
      ? (JSON.parse(JSON.stringify(client.treatmentPlan)) as Record<string, Prisma.InputJsonValue>)
      : {};
    treatmentPlan.parentSignature = validated.signatureName;
    treatmentPlan.parentSignatureDate = signedAt;
    treatmentPlan.parentPlanReviewed = true;
    treatmentPlan.parentPlanReviewedAt = signedAt;

    // Keep ASSESSMENT_SCHEDULED until assembleReport; ensure we are at least past PA if TP is completed.
    const bumpToScheduled =
      client.status === 'PA_APPROVED' && treatmentPlan.status === 'COMPLETED';

    await prisma.client.update({
      where: { id: clientId },
      data: bumpToScheduled
        ? {
            treatmentPlan: treatmentPlan as Prisma.InputJsonValue,
            status: 'ASSESSMENT_SCHEDULED',
          }
        : { treatmentPlan: treatmentPlan as Prisma.InputJsonValue },
    });

    // Ids only — no PHI (signature / guardian names excluded).
    void writeAuditLog({
      action: 'SIGN',
      entityType: 'TREATMENT_PLAN',
      entityId: clientId,
      meta: {
        event: 'PARENT_TREATMENT_PLAN_ESIGN',
        clientId,
        packetId: gate.packetId,
        nameMatched: validated.nameMatched,
      },
    });

    revalidatePath(`/client/${clientId}`);
    if (client.intakePacket?.magicLinkToken) {
      revalidatePath(`/magic-link/${client.intakePacket.magicLinkToken}`);
    }
    return {
      success: true as const,
      nameMatched: validated.nameMatched,
      ...(validated.nameMatched
        ? {}
        : {
            warning:
              'Signed name does not match the guardian name on file. The clinic may follow up to confirm.',
          }),
    };
  } catch (e) {
    console.error('Failed to sign treatment plan:', e instanceof Error ? e.message : e);
    return { success: false, error: 'Failed to sign treatment plan.' };
  }
}

export async function saveClientSchedule(
  clientId: string,
  schedule: ClientSchedule,
  preferences?: StaffingPreferences
) {
  try {
    const gate = await requireStaffOrParent({ clientId });
    if (!gate.ok) return { success: false, error: gate.error };

    const client = await prisma.client.findUnique({ 
      where: { id: clientId },
      include: { intakePacket: true }
    });
    if (!client) return { success: false, error: "Client not found" };

    const treatmentPlan = client.treatmentPlan ? JSON.parse(JSON.stringify(client.treatmentPlan)) : {};
    treatmentPlan.preferredSchedule = schedule;
    if (preferences) {
      treatmentPlan.staffingPreferences = preferences;
    }

    const dataToUpdate: Prisma.ClientUpdateInput = { treatmentPlan };
    // Defensive: if still on TX_PA_APPROVED (legacy), hand off to staffing when prefs saved.
    // Primary path is approveTreatmentPaRequest → STAFFING_PENDING.
    if (client.status === 'TX_PA_APPROVED') {
      dataToUpdate.status = 'STAFFING_PENDING';
    }

    await prisma.client.update({
      where: { id: clientId },
      data: dataToUpdate
    });
    
    revalidatePath(`/client/${clientId}`);
    if (client.intakePacket?.magicLinkToken) {
      revalidatePath(`/magic-link/${client.intakePacket.magicLinkToken}`);
    }
    return { success: true };
  } catch (e) {
    console.error("Failed to save client schedule:", e instanceof Error ? e.message : e);
    return { success: false, error: 'Failed to save client schedule. Please try again.' };
  }
}

