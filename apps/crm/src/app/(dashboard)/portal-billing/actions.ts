'use server';

/**
 * Billing portal queue actions — Assessment + Treatment PA (manual Plutus tracker).
 *
 * Client-status transitions stay canonical in
 * `@/app/(dashboard)/portal-case/actions/billing.ts` (gated by
 * `clientStatusGates.assertPredecessor`). This file only:
 *   1. wraps those canonical actions for the portal-billing queues
 *      (structured results + queue revalidation), and
 *   2. owns PA-row-only fields that never move client status:
 *      denial reason + P2P resolution (`p2pResolved` / `p2pNotes`).
 *
 * No EDI / Plutus API in this phase — submitted/approved/denied + auth #/units only.
 */

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireStaff, BILLING_ROLES } from '@/lib/auth-guard';
import { notifyUsers } from '@/app/actions/notifications';
import {
  approvePaRequest,
  approveTreatmentPaRequest,
  completeVobAndCreds,
  denyPaRequest,
  submitPaRequest,
  submitTreatmentPaRequest,
} from '@/app/(dashboard)/portal-case/actions/billing';

export type BillingQueueActionResult = { success: boolean; error?: string };

/** Canonical actions return unions where `error` is branch-dependent — normalize. */
function toResult(result: { success?: boolean; error?: unknown }): BillingQueueActionResult {
  if (result?.success) return { success: true };
  return {
    success: false,
    error:
      'error' in result && result.error
        ? String(result.error)
        : 'Operation failed. Please try again.',
  };
}

function revalidateBillingQueues(clientId?: string) {
  revalidatePath('/portal-billing');
  revalidatePath('/portal-billing/clients');
  if (clientId) revalidatePath(`/client/${clientId}`);
}

type PaDecisionNotificationInput = {
  paId: string;
  paType: 'ASSESSMENT' | 'TREATMENT';
  previousStatus: string;
  decision: 'APPROVED' | 'DENIED_CLERICAL' | 'DENIED_CLINICAL';
  actorId: string;
  clientId: string;
  clientName: string;
  caseCoordinatorId: string | null;
  reason?: string;
};

/**
 * Best-effort PA handoff to Case Coordination. The persisted status check makes
 * an idempotent repeat a no-op; notifyUsers adds a second 24-hour unread dedupe.
 */
async function notifyPaDecision(input: PaDecisionNotificationInput) {
  if (input.previousStatus === input.decision) return;

  try {
    const current = await prisma.pARequest.findUnique({
      where: { id: input.paId },
      select: { status: true },
    });
    if (current?.status !== input.decision) return;

    const fallbackRecipients = input.caseCoordinatorId
      ? []
      : await prisma.user.findMany({
          where: { role: 'CASE_COORDINATOR', isActive: true },
          select: { id: true },
          take: 20,
        });
    const recipientIds = (
      input.caseCoordinatorId
        ? [input.caseCoordinatorId]
        : fallbackRecipients.map((user) => user.id)
    ).filter((userId) => userId !== input.actorId);

    const paLabel = input.paType === 'TREATMENT' ? 'Treatment PA' : 'Assessment PA';
    const approved = input.decision === 'APPROVED';
    const reasonSnippet = input.reason?.replace(/\s+/g, ' ').trim().slice(0, 120);

    await notifyUsers({
      userIds: recipientIds,
      title: `${paLabel} ${approved ? 'approved' : 'denied'} · ${input.clientName}`,
      message: approved
        ? `${input.clientName}'s ${paLabel} was approved. Review the authorization and coordinate next steps.`
        : `${input.clientName}'s ${paLabel} was denied. Review the billing record and next steps.${reasonSnippet ? ` Reason: ${reasonSnippet}` : ''}`,
      type: approved ? 'INFO' : 'ALERT',
      linkUrl: `/client/${input.clientId}?mode=billing`,
      dedupeHours: 24,
    });
  } catch (notifyError) {
    console.error(
      'notifyPaDecision failed:',
      notifyError instanceof Error ? notifyError.message : 'Unknown error'
    );
  }
}

/** VOB + credentialing done → creates/updates the ASSESSMENT PARequest (canonical). */
export async function markVobComplete(clientId: string): Promise<BillingQueueActionResult> {
  const gate = await requireStaff(BILLING_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const result = toResult(await completeVobAndCreds(clientId));
  if (result.success) revalidateBillingQueues(clientId);
  return result;
}

/** Assessment PA (97151) logged as submitted in Plutus → PA_SUBMITTED (canonical). */
export async function markAssessmentPaSubmitted(
  clientId: string
): Promise<BillingQueueActionResult> {
  const gate = await requireStaff(BILLING_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const result = toResult(await submitPaRequest(clientId));
  if (result.success) revalidateBillingQueues(clientId);
  return result;
}

/** Treatment PA (97153/97155/97156) logged as submitted in Plutus → TX_PA_SUBMITTED (canonical). */
export async function markTreatmentPaSubmitted(
  clientId: string
): Promise<BillingQueueActionResult> {
  const gate = await requireStaff(BILLING_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const result = toResult(await submitTreatmentPaRequest(clientId));
  if (result.success) revalidateBillingQueues(clientId);
  return result;
}

/**
 * Record a payer approval from the queue. Dispatches to the canonical
 * ASSESSMENT / TREATMENT approve action based on the PA row's type.
 */
export async function recordPaApproval(
  paId: string,
  input: {
    authNumber: string;
    approvedUnits: number;
    effectiveDate: string;
    expirationDate: string;
  }
): Promise<BillingQueueActionResult> {
  const gate = await requireStaff(BILLING_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const authNumber = input.authNumber.trim();
  const approvedUnits = Math.trunc(Number(input.approvedUnits));
  const effectiveDate = new Date(input.effectiveDate);
  const expirationDate = new Date(input.expirationDate);

  if (!authNumber) return { success: false, error: 'Auth number is required.' };
  if (!Number.isFinite(approvedUnits) || approvedUnits <= 0) {
    return { success: false, error: 'Approved units must be a positive number.' };
  }
  if (Number.isNaN(effectiveDate.getTime()) || Number.isNaN(expirationDate.getTime())) {
    return { success: false, error: 'Effective and expiration dates are both required.' };
  }

  try {
    const pa = await prisma.pARequest.findUnique({
      where: { id: paId },
      select: {
        type: true,
        status: true,
        clientId: true,
        client: {
          select: {
            firstName: true,
            lastName: true,
            caseCoordinatorId: true,
          },
        },
      },
    });
    if (!pa) return { success: false, error: 'PA request not found.' };

    const data = { authNumber, approvedUnits, effectiveDate, expirationDate };
    const result = toResult(
      pa.type === 'TREATMENT'
        ? await approveTreatmentPaRequest(paId, data)
        : await approvePaRequest(paId, data)
    );

    if (result.success) {
      revalidateBillingQueues(pa.clientId);
      await notifyPaDecision({
        paId,
        paType: pa.type,
        previousStatus: pa.status,
        decision: 'APPROVED',
        actorId: gate.user.id,
        clientId: pa.clientId,
        clientName: `${pa.client.firstName} ${pa.client.lastName}`,
        caseCoordinatorId: pa.client.caseCoordinatorId,
      });
    }
    return result;
  } catch (error) {
    console.error(
      'recordPaApproval failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, error: 'Failed to record PA approval.' };
  }
}

/**
 * Record a payer denial with a required reason. Status flip is canonical
 * (`denyPaRequest`); the reason lands on the PA row (`p2pNotes`) and a fresh
 * clinical denial reopens P2P (`p2pResolved = false`) so the BCBA queue picks it up.
 */
export async function recordPaDenial(
  paId: string,
  input: { isClinical: boolean; reason: string }
): Promise<BillingQueueActionResult> {
  const gate = await requireStaff(BILLING_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const reason = input.reason.trim();
  if (!reason) return { success: false, error: 'A denial reason is required.' };

  try {
    const existing = await prisma.pARequest.findUnique({
      where: { id: paId },
      select: {
        type: true,
        status: true,
        clientId: true,
        client: {
          select: {
            firstName: true,
            lastName: true,
            caseCoordinatorId: true,
          },
        },
      },
    });
    if (!existing) return { success: false, error: 'PA request not found.' };

    const result = toResult(await denyPaRequest(paId, input.isClinical));
    if (!result.success) return result;

    const pa = await prisma.pARequest.update({
      where: { id: paId },
      data: { p2pNotes: reason, p2pResolved: false },
      select: { clientId: true },
    });

    revalidateBillingQueues(pa.clientId);
    revalidatePath('/portal-clinical'); // BCBA P2P queue reads p2pResolved
    await notifyPaDecision({
      paId,
      paType: existing.type,
      previousStatus: existing.status,
      decision: input.isClinical ? 'DENIED_CLINICAL' : 'DENIED_CLERICAL',
      actorId: gate.user.id,
      clientId: existing.clientId,
      clientName: `${existing.client.firstName} ${existing.client.lastName}`,
      caseCoordinatorId: existing.client.caseCoordinatorId,
      reason,
    });
    return { success: true };
  } catch (error) {
    console.error(
      'recordPaDenial failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, error: 'Failed to record PA denial.' };
  }
}

/**
 * Billing-side P2P resolution log (peer-to-peer review outcome relayed by the
 * BCBA / payer call). PA-row-only write — no client status change. The
 * clinical-portal equivalent (`resolveP2PDenial`) is gated to CLINICAL_ROLES;
 * this one lets billing staff log the same outcome from the PA queue.
 */
export async function resolvePaP2p(
  paId: string,
  notes: string
): Promise<BillingQueueActionResult> {
  const gate = await requireStaff(BILLING_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const trimmed = notes.trim();
  if (!trimmed) return { success: false, error: 'P2P resolution notes are required.' };

  try {
    const existing = await prisma.pARequest.findUnique({
      where: { id: paId },
      select: { status: true, clientId: true },
    });
    if (!existing) return { success: false, error: 'PA request not found.' };
    if (existing.status !== 'DENIED_CLINICAL') {
      return {
        success: false,
        error: 'P2P resolution only applies to clinical denials (DENIED_CLINICAL).',
      };
    }

    await prisma.pARequest.update({
      where: { id: paId },
      data: { p2pResolved: true, p2pNotes: trimmed },
    });

    revalidateBillingQueues(existing.clientId);
    revalidatePath('/portal-clinical');
    return { success: true };
  } catch (error) {
    console.error(
      'resolvePaP2p failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, error: 'Failed to log P2P resolution.' };
  }
}
