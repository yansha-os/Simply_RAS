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

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function completeVobAndCreds(clientId: string) {
  try {
    const auth = await requireStaff(BILLING_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };

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

    // Create or update PARequest
    const pa = client.paRequests.find(p => p.type === 'ASSESSMENT');
    
    if (pa) {
      await prisma.pARequest.update({
        where: { id: pa.id },
        data: { vobCompleted: true, providerCredentialed: true }
      });
    } else {
      await prisma.pARequest.create({
        data: {
          clientId,
          type: 'ASSESSMENT',
          vobCompleted: true,
          providerCredentialed: true,
          status: 'NOT_STARTED'
        }
      });
    }

    // Move client to VOB_COMPLETED
    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'VOB_COMPLETED' }
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-case/clients');
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    const message = actionErrorMessage(error, 'Failed to complete VOB.');
    console.error('Failed to complete VOB:', message);
    return { success: false, error: message };
  }
}

export async function submitPaRequest(clientId: string) {
  try {
    const auth = await requireStaff(BILLING_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };

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

    await prisma.pARequest.update({
      where: { id: pa.id },
      data: { status: 'SUBMITTED' }
    });

    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'PA_SUBMITTED' }
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-case/clients');
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    const message = actionErrorMessage(error, 'Failed to submit PA.');
    console.error('Failed to submit PA:', message);
    return { success: false, error: message };
  }
}

export async function denyPaRequest(paId: string, isClinical: boolean) {
  try {
    const gate = await requireStaff(BILLING_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

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

    const pa = await prisma.pARequest.update({
      where: { id: paId },
      data: { status: isClinical ? 'DENIED_CLINICAL' : 'DENIED_CLERICAL' }
    });

    revalidatePath(`/client/${pa.clientId}`);
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    const message = actionErrorMessage(error, 'Failed to deny PA.');
    console.error('Failed to deny PA:', message);
    return { success: false, error: message };
  }
}

export async function approvePaRequest(paId: string, data: { authNumber: string, approvedUnits: number, effectiveDate: Date, expirationDate: Date }) {
  try {
    const gate = await requireStaff(BILLING_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

    if (new Date(data.expirationDate) < new Date(data.effectiveDate)) {
      return { success: false, error: 'Expiration date cannot be before the effective date.' };
    }

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

    const pa = await prisma.pARequest.update({
      where: { id: paId },
      data: { 
        status: 'APPROVED',
        authNumber: data.authNumber,
        approvedUnits: data.approvedUnits,
        effectiveDate: data.effectiveDate,
        expirationDate: data.expirationDate
      }
    });

    await prisma.client.update({
      where: { id: pa.clientId },
      data: { status: 'PA_APPROVED' }
    });

    revalidatePath(`/client/${pa.clientId}`);
    revalidatePath('/portal-case/clients');
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
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
    
    if (pa) {
      await prisma.pARequest.update({
        where: { id: pa.id },
        data: { status: 'SUBMITTED' }
      });
    } else {
      await prisma.pARequest.create({
        data: {
          clientId,
          type: 'TREATMENT',
          status: 'SUBMITTED'
        }
      });
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'TX_PA_SUBMITTED' }
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    return { success: true };
  } catch (error: unknown) {
    const message = actionErrorMessage(error, 'Failed to submit Treatment PA.');
    console.error('Failed to submit Treatment PA:', message);
    return { success: false, error: message };
  }
}

export async function approveTreatmentPaRequest(paId: string, data: { authNumber: string, approvedUnits: number, effectiveDate: Date, expirationDate: Date }) {
  try {
    const gate = await requireStaff(BILLING_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

    if (new Date(data.expirationDate) < new Date(data.effectiveDate)) {
      return { success: false, error: 'Expiration date cannot be before the effective date.' };
    }

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

    const pa = await prisma.pARequest.update({
      where: { id: paId },
      data: { 
        status: 'APPROVED',
        authNumber: data.authNumber,
        approvedUnits: data.approvedUnits,
        effectiveDate: data.effectiveDate,
        expirationDate: data.expirationDate
      }
    });

    // Explicit handoff: Treatment PA approved → Case Coord staffing (not buried in saveClientSchedule).
    // ACTIVE still requires a durable first Session (Bridge E).
    await prisma.client.update({
      where: { id: pa.clientId },
      data: { status: 'STAFFING_PENDING' }
    });

    revalidatePath(`/client/${pa.clientId}`);
    revalidatePath('/portal-billing');
    revalidatePath('/portal-billing/clients');
    revalidatePath('/portal-case-coord/openings');
    return { success: true };
  } catch (error: unknown) {
    const message = actionErrorMessage(error, 'Failed to approve Treatment PA.');
    console.error('Failed to approve Treatment PA:', message);
    return { success: false, error: message };
  }
}
