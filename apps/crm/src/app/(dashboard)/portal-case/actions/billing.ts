'use server';

/**
 * Canonical Plutus manual tracker for Assessment PA + Treatment PA.
 * Ownership: BillingAuthTab + portal billing queues import from here.
 * `portal-billing/actions.ts` is legacy FormData wrappers only — do not duplicate status logic there.
 * No EDI / Plutus API in this phase — submitted/approved/denied + auth numbers/units only.
 */

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { assertPredecessor } from '@/lib/clientStatusGates';
import { requireStaff, BILLING_ROLES } from '@/lib/auth-guard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BILLING_STATUS_CHANGED = 'BILLING_STATUS_CHANGED';

type PaApprovalInput = {
  authNumber: string;
  approvedUnits: number;
  effectiveDate: Date;
  expirationDate: Date;
};

function validatePaApprovalInput(data: PaApprovalInput) {
  const authNumber = data.authNumber?.trim();
  const approvedUnits = data.approvedUnits;
  const effectiveDate = new Date(data.effectiveDate);
  const expirationDate = new Date(data.expirationDate);
  if (!authNumber || authNumber.length > 200) {
    return { ok: false as const, error: 'A valid authorization number is required.' };
  }
  if (!Number.isInteger(approvedUnits) || approvedUnits <= 0 || approvedUnits > 1_000_000) {
    return { ok: false as const, error: 'Approved units must be a positive whole number.' };
  }
  if (!Number.isFinite(effectiveDate.getTime()) || !Number.isFinite(expirationDate.getTime())) {
    return { ok: false as const, error: 'Valid effective and expiration dates are required.' };
  }
  if (expirationDate < effectiveDate) {
    return { ok: false as const, error: 'Expiration date cannot be before the effective date.' };
  }
  return {
    ok: true as const,
    value: { authNumber, approvedUnits, effectiveDate, expirationDate },
  };
}

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function completeVobAndCreds(clientId: string) {
  try {
    const auth = await requireStaff(BILLING_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    if (!UUID_RE.test(clientId)) return { success: false, error: 'Client not found.' };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { paRequests: true }
    });

    if (!client) throw new Error('Client not found');

    const gate = assertPredecessor(
      client.status,
      ['CLINICAL_REVIEW_APPROVED', 'VOB_COMPLETED'],
      'VOB_COMPLETED'
    );
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }
    if (gate.alreadyPast && client.status !== 'VOB_COMPLETED') {
      // Already advanced past VOB — do not downgrade status
      return { success: true };
    }

    const pa = client.paRequests.find(p => p.type === 'ASSESSMENT');
    await prisma.$transaction(async (tx) => {
      const clientUpdated = await tx.client.updateMany({
        where: { id: clientId, status: client.status },
        data: { status: 'VOB_COMPLETED' },
      });
      if (clientUpdated.count !== 1) throw new Error(BILLING_STATUS_CHANGED);

      if (pa) {
        const paUpdated = await tx.pARequest.updateMany({
          where: { id: pa.id, clientId, type: 'ASSESSMENT', updatedAt: pa.updatedAt },
          data: { vobCompleted: true, providerCredentialed: true },
        });
        if (paUpdated.count !== 1) throw new Error(BILLING_STATUS_CHANGED);
      } else {
        await tx.pARequest.create({
          data: {
            clientId,
            type: 'ASSESSMENT',
            vobCompleted: true,
            providerCredentialed: true,
            status: 'NOT_STARTED',
          },
        });
      }
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-case/clients');
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === BILLING_STATUS_CHANGED) {
      return { success: false, error: 'The PA or client status changed. Refresh and try again.' };
    }
    const message = actionErrorMessage(error, 'Failed to complete VOB.');
    console.error('Failed to complete VOB:', message);
    return { success: false, error: message };
  }
}

export async function submitPaRequest(clientId: string) {
  try {
    const auth = await requireStaff(BILLING_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    if (!UUID_RE.test(clientId)) return { success: false, error: 'Client not found.' };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { paRequests: true }
    });

    if (!client) throw new Error('Client not found');

    const gate = assertPredecessor(
      client.status,
      ['VOB_COMPLETED', 'PA_SUBMITTED'],
      'PA_SUBMITTED'
    );
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }
    if (gate.alreadyPast && client.status !== 'PA_SUBMITTED') {
      return { success: true };
    }

    const pa = client.paRequests.find(p => p.type === 'ASSESSMENT');
    if (!pa) throw new Error('PA Request record not found. Complete VOB first.');
    if (!pa.vobCompleted || !pa.providerCredentialed) {
      return { success: false, error: 'Complete VOB & credentialing before submitting Assessment PA.' };
    }
    if (!['NOT_STARTED', 'SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(pa.status)) {
      return { success: false, error: `Assessment PA cannot be submitted from ${pa.status}.` };
    }

    await prisma.$transaction(async (tx) => {
      const clientUpdated = await tx.client.updateMany({
        where: { id: clientId, status: client.status },
        data: { status: 'PA_SUBMITTED' },
      });
      const paUpdated = await tx.pARequest.updateMany({
        where: {
          id: pa.id,
          clientId,
          type: 'ASSESSMENT',
          status: pa.status,
          updatedAt: pa.updatedAt,
        },
        data: { status: 'SUBMITTED' },
      });
      if (clientUpdated.count !== 1 || paUpdated.count !== 1) {
        throw new Error(BILLING_STATUS_CHANGED);
      }
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-case/clients');
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === BILLING_STATUS_CHANGED) {
      return { success: false, error: 'The PA or client status changed. Refresh and try again.' };
    }
    const message = actionErrorMessage(error, 'Failed to submit PA.');
    console.error('Failed to submit PA:', message);
    return { success: false, error: message };
  }
}

export async function denyPaRequest(paId: string, isClinical: boolean, reason?: string) {
  try {
    const gate = await requireStaff(BILLING_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };
    if (!UUID_RE.test(paId)) return { success: false, error: 'PA request not found.' };

    const existing = await prisma.pARequest.findUnique({
      where: { id: paId },
      include: { client: { select: { id: true, status: true } } },
    });
    if (!existing) return { success: false, error: 'PA request not found.' };

    const deniable = ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'];
    if (!deniable.includes(existing.status)) {
      return {
        success: false,
        error: `Pipeline gate: Assessment/Treatment PA must be SUBMITTED before deny (got ${existing.status}).`,
      };
    }
    const normalizedReason = reason?.trim();
    if (normalizedReason && normalizedReason.length > 5_000) {
      return { success: false, error: 'Denial reason must be 5,000 characters or fewer.' };
    }

    const denied = await prisma.pARequest.updateMany({
      where: {
        id: paId,
        clientId: existing.clientId,
        type: existing.type,
        status: existing.status,
        updatedAt: existing.updatedAt,
      },
      data: {
        status: isClinical ? 'DENIED_CLINICAL' : 'DENIED_CLERICAL',
        ...(normalizedReason
          ? { p2pNotes: normalizedReason, p2pResolved: false }
          : {}),
      },
    });
    if (denied.count !== 1) {
      return { success: false, error: 'The PA status changed. Refresh and try again.' };
    }

    revalidatePath(`/client/${existing.clientId}`);
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    const message = actionErrorMessage(error, 'Failed to deny PA.');
    console.error('Failed to deny PA:', message);
    return { success: false, error: message };
  }
}

export async function approvePaRequest(paId: string, data: PaApprovalInput) {
  try {
    const gate = await requireStaff(BILLING_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

    if (!UUID_RE.test(paId)) return { success: false, error: 'PA request not found.' };
    const validated = validatePaApprovalInput(data);
    if (!validated.ok) return { success: false, error: validated.error };

    const existing = await prisma.pARequest.findUnique({
      where: { id: paId },
      include: { client: { select: { id: true, status: true } } },
    });
    if (!existing) return { success: false, error: 'PA request not found.' };
    if (existing.type !== 'ASSESSMENT') {
      return { success: false, error: 'Use Treatment PA approve for TREATMENT requests.' };
    }

    const clientGate = assertPredecessor(
      existing.client.status,
      ['PA_SUBMITTED'],
      'PA_APPROVED'
    );
    if (!clientGate.ok) {
      return { success: false, error: clientGate.error };
    }
    if (clientGate.alreadyPast && existing.client.status !== 'PA_SUBMITTED') {
      return { success: true };
    }

    const approvable = ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'];
    if (!approvable.includes(existing.status)) {
      return {
        success: false,
        error: `Pipeline gate: Assessment PA must be SUBMITTED (or denied pending re-decision) before approve (got ${existing.status}).`,
      };
    }

    await prisma.$transaction(async (tx) => {
      const clientUpdated = await tx.client.updateMany({
        where: { id: existing.clientId, status: 'PA_SUBMITTED' },
        data: { status: 'PA_APPROVED' },
      });
      const paUpdated = await tx.pARequest.updateMany({
        where: {
          id: paId,
          clientId: existing.clientId,
          type: 'ASSESSMENT',
          status: existing.status,
        },
        data: { status: 'APPROVED', ...validated.value },
      });
      if (clientUpdated.count !== 1 || paUpdated.count !== 1) {
        throw new Error(BILLING_STATUS_CHANGED);
      }
    });

    revalidatePath(`/client/${existing.clientId}`);
    revalidatePath('/portal-case/clients');
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === BILLING_STATUS_CHANGED) {
      return { success: false, error: 'The PA or client status changed. Refresh and try again.' };
    }
    const message = actionErrorMessage(error, 'Failed to approve PA.');
    console.error('Failed to approve PA:', message);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------
// TREATMENT PA ACTIONS
// ---------------------------------------------------------

export async function submitTreatmentPaRequest(clientId: string) {
  try {
    const auth = await requireStaff(BILLING_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    if (!UUID_RE.test(clientId)) return { success: false, error: 'Client not found.' };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { paRequests: true }
    });

    if (!client) throw new Error('Client not found');

    const gate = assertPredecessor(
      client.status,
      ['REPORT_ASSEMBLED', 'TX_PA_SUBMITTED'],
      'TX_PA_SUBMITTED'
    );
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }
    if (gate.alreadyPast && client.status !== 'TX_PA_SUBMITTED') {
      return { success: true };
    }

    const pa = client.paRequests.find(p => p.type === 'TREATMENT');
    if (pa && !['NOT_STARTED', 'SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(pa.status)) {
      return { success: false, error: `Treatment PA cannot be submitted from ${pa.status}.` };
    }

    await prisma.$transaction(async (tx) => {
      const clientUpdated = await tx.client.updateMany({
        where: { id: clientId, status: client.status },
        data: { status: 'TX_PA_SUBMITTED' },
      });
      if (clientUpdated.count !== 1) throw new Error(BILLING_STATUS_CHANGED);

      if (pa) {
        const paUpdated = await tx.pARequest.updateMany({
          where: {
            id: pa.id,
            clientId,
            type: 'TREATMENT',
            status: pa.status,
            updatedAt: pa.updatedAt,
          },
          data: { status: 'SUBMITTED' },
        });
        if (paUpdated.count !== 1) throw new Error(BILLING_STATUS_CHANGED);
      } else {
        await tx.pARequest.create({
          data: { clientId, type: 'TREATMENT', status: 'SUBMITTED' },
        });
      }
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === BILLING_STATUS_CHANGED) {
      return { success: false, error: 'The PA or client status changed. Refresh and try again.' };
    }
    const message = actionErrorMessage(error, 'Failed to submit Treatment PA.');
    console.error('Failed to submit Treatment PA:', message);
    return { success: false, error: message };
  }
}

export async function approveTreatmentPaRequest(paId: string, data: PaApprovalInput) {
  try {
    const gate = await requireStaff(BILLING_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

    if (!UUID_RE.test(paId)) return { success: false, error: 'PA request not found.' };
    const validated = validatePaApprovalInput(data);
    if (!validated.ok) return { success: false, error: validated.error };

    const existing = await prisma.pARequest.findUnique({
      where: { id: paId },
      include: { client: { select: { id: true, status: true } } },
    });
    if (!existing) return { success: false, error: 'PA request not found.' };
    if (existing.type !== 'TREATMENT') {
      return { success: false, error: 'Use Assessment PA approve for ASSESSMENT requests.' };
    }

    const clientGate = assertPredecessor(
      existing.client.status,
      ['TX_PA_SUBMITTED', 'TX_PA_APPROVED'],
      'STAFFING_PENDING'
    );
    if (!clientGate.ok) {
      return { success: false, error: clientGate.error };
    }
    if (clientGate.alreadyPast && existing.client.status !== 'TX_PA_SUBMITTED') {
      return { success: true };
    }

    const approvable = ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'];
    if (!approvable.includes(existing.status)) {
      return {
        success: false,
        error: `Pipeline gate: Treatment PA must be SUBMITTED (or denied pending re-decision) before approve (got ${existing.status}).`,
      };
    }

    await prisma.$transaction(async (tx) => {
      const clientUpdated = await tx.client.updateMany({
        where: { id: existing.clientId, status: 'TX_PA_SUBMITTED' },
        data: { status: 'STAFFING_PENDING' },
      });
      const paUpdated = await tx.pARequest.updateMany({
        where: {
          id: paId,
          clientId: existing.clientId,
          type: 'TREATMENT',
          status: existing.status,
        },
        data: { status: 'APPROVED', ...validated.value },
      });
      if (clientUpdated.count !== 1 || paUpdated.count !== 1) {
        throw new Error(BILLING_STATUS_CHANGED);
      }
    });

    revalidatePath(`/client/${existing.clientId}`);
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    revalidatePath('/portal-case-coord/openings');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === BILLING_STATUS_CHANGED) {
      return { success: false, error: 'The PA or client status changed. Refresh and try again.' };
    }
    const message = actionErrorMessage(error, 'Failed to approve Treatment PA.');
    console.error('Failed to approve Treatment PA:', message);
    return { success: false, error: message };
  }
}
