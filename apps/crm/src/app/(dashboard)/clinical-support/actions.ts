'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { assertPredecessor } from '@/lib/clientStatusGates'
import {
  requireClientAccess,
  requireStaff,
  CLINICAL_ROLES,
} from '@/lib/auth-guard'
import {
  assembleReport as assembleCanonicalReport,
  scheduleAssessment as scheduleCanonicalAssessment,
} from '@/app/(dashboard)/portal-case/actions/clinical-support'

const STATUS_CHANGED = 'CLINICAL_SUPPORT_STATUS_CHANGED'

async function requireClinicalClientAccess(clientId: string) {
  const roleGate = await requireStaff(CLINICAL_ROLES)
  if (!roleGate.ok) return roleGate

  return requireClientAccess(clientId)
}

/**
 * Clinical Support document cross-check → clinical review approved.
 * (Previously skipped ahead to PA_SUBMITTED — that bypass is closed.)
 */
export async function verifyDocuments(clientId: string) {
  const auth = await requireClinicalClientAccess(clientId)
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        status: true,
        intakePacket: { select: { status: true } },
      },
    })
    if (!client) return { success: false, error: 'Client not found.' }

    const gate = assertPredecessor(
      client.status,
      ['DOCS_APPROVED_INTAKE', 'CLINICAL_REVIEW_APPROVED'],
      'CLINICAL_REVIEW_APPROVED'
    )
    if (!gate.ok) {
      return { success: false, error: gate.error }
    }
    if (gate.alreadyPast) {
      return { success: true }
    }
    if (client.intakePacket?.status !== 'APPROVED') {
      return {
        success: false,
        error: 'The intake packet must be approved before clinical verification.',
      }
    }

    const updated = await prisma.client.updateMany({
      where: { id: clientId, status: 'DOCS_APPROVED_INTAKE' },
      data: { status: 'CLINICAL_REVIEW_APPROVED' },
    })
    if (updated.count !== 1) {
      return {
        success: false,
        error: 'This client moved to another workflow stage. Refresh the queue and try again.',
      }
    }

    revalidatePath('/', 'layout')
    revalidatePath('/clinical-support')
    revalidatePath('/clinical-support/clients')
    revalidatePath(`/client/${clientId}`)
    return { success: true }
  } catch (error) {
    console.error('verifyDocuments failed:', error instanceof Error ? error.message : error)
    return { success: false, error: 'Failed to verify documents.' }
  }
}

/**
 * Clinical Support "sent to Plutus" for Treatment PA — must follow report assembly.
 * Does not invent EDI; marks Treatment PA tracker SUBMITTED (same as billing submit).
 */
export async function submitTreatmentPacket(clientId: string) {
  const auth = await requireClinicalClientAccess(clientId)
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        status: true,
        paRequests: {
          where: { type: 'TREATMENT' },
          select: { id: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!client) return { success: false, error: 'Client not found.' }

    const gate = assertPredecessor(
      client.status,
      ['REPORT_ASSEMBLED', 'TX_PA_SUBMITTED'],
      'TX_PA_SUBMITTED'
    )
    if (!gate.ok) {
      return {
        success: false,
        error: `${gate.error} Assemble the report packet first, then mark Treatment PA submitted (Plutus manual tracker).`,
      }
    }
    if (gate.alreadyPast) {
      return { success: true }
    }

    const existingTx = client.paRequests[0]
    await prisma.$transaction(async (tx) => {
      const updated = await tx.client.updateMany({
        where: { id: clientId, status: 'REPORT_ASSEMBLED' },
        data: { status: 'TX_PA_SUBMITTED' },
      })
      if (updated.count !== 1) throw new Error(STATUS_CHANGED)

      if (existingTx) {
        await tx.pARequest.update({
          where: { id: existingTx.id },
          data: { status: 'SUBMITTED' },
        })
      } else {
        await tx.pARequest.create({
          data: {
            clientId,
            type: 'TREATMENT',
            status: 'SUBMITTED',
          },
        })
      }
    })

    revalidatePath('/', 'layout')
    revalidatePath('/clinical-support')
    revalidatePath('/clinical-support/clients')
    revalidatePath(`/client/${clientId}`)
    revalidatePath('/portal-billing/clients')
    return { success: true }
  } catch (error) {
    if (error instanceof Error && error.message === STATUS_CHANGED) {
      return {
        success: false,
        error: 'This client moved to another workflow stage. Refresh the queue and try again.',
      }
    }
    console.error('submitTreatmentPacket failed:', error instanceof Error ? error.message : error)
    return { success: false, error: 'Failed to submit packet.' }
  }
}

/**
 * Queue-safe wrapper around the canonical assessment scheduler. The raw
 * datetime-local string is intentionally preserved so the canonical action
 * interprets it as America/New_York wall-clock time.
 */
export async function scheduleClinicalSupportAssessment(
  clientId: string,
  clinicDateTime: string,
  expectedClientStatus: string,
  expectedBcbaId: string | null
) {
  const auth = await requireClinicalClientAccess(clientId)
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const result = await scheduleCanonicalAssessment({
      clientId,
      date: clinicDateTime,
      expectedClientStatus,
      expectedBcbaId,
      reason: 'Clinical Support scheduled authorized assessment',
    })
    if (result.success) {
      revalidatePath('/', 'layout')
      revalidatePath('/clinical-support/clients')
    }
    return result
  } catch (error) {
    console.error(
      'scheduleClinicalSupportAssessment failed:',
      error instanceof Error ? error.message : error
    )
    return { success: false, error: 'Failed to schedule assessment.' }
  }
}

/** Queue-safe wrapper around the canonical report-assembly transition. */
export async function assembleClinicalSupportReport(clientId: string) {
  const auth = await requireClinicalClientAccess(clientId)
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const result = await assembleCanonicalReport(clientId)
    if (result.success) {
      revalidatePath('/', 'layout')
      revalidatePath('/clinical-support/clients')
    }
    return result
  } catch (error) {
    console.error(
      'assembleClinicalSupportReport failed:',
      error instanceof Error ? error.message : error
    )
    return { success: false, error: 'Failed to assemble report.' }
  }
}
