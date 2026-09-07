'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireParentPacketAccess } from '@/lib/magicLinkGuard'
import { notifyCaseTeam, notifyClient, notifyRoles } from '@/lib/notificationDispatcher'
import { parsePacketFormData, safeParseJson } from '@/lib/safeParseJson'
import {
  isClinicalFamilyCorrectionLoop,
  packetStatusAfterClinicalCorrectionResubmit,
  preserveClinicalReviewApprovals,
} from '@/lib/clinicalReviewApprovals'
import {
  evaluateClinicalCorrectionSubmit,
  evaluatePacketFields,
} from '@/lib/magicLinkPacketSubmit'

function parseRejectionDetails(raw: unknown): Record<string, string> {
  const parsed = safeParseJson<unknown>(raw, {})
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
  )
}

export type SubmitMagicLinkPacketResult =
  | { success: true }
  | {
      success: false
      error: string
      missingForm01?: string[]
      missingForm02?: string[]
      missingDocs?: string[]
    }

/**
 * Parent submit for the magic-link packet. Requires a live magic link bound
 * to this device, and validates every required field/document server-side —
 * the old prototype that auto-checked all items is gone.
 *
 * On resubmit after Intake rejections, rejectionDetails is wiped and the
 * packet returns to SUBMITTED. Clinical Support corrections stay APPROVED
 * on the CSS desk — Intake is not notified and does not re-review.
 * CSS correction submits only require the flagged document/field keys.
 */
export async function submitMagicLinkPacket(
  packetId: string,
  formData?: Record<string, unknown>
): Promise<SubmitMagicLinkPacketResult> {
  const gate = await requireParentPacketAccess({ packetId })
  if (!gate.ok) return { success: false, error: gate.error }

  const packet = await prisma.intakePacket.findUnique({
    where: { id: gate.packetId },
  })
  if (!packet || packet.clientId !== gate.clientId) {
    return { success: false, error: 'Intake packet not found.' }
  }

  const client = await prisma.client.findUnique({ where: { id: packet.clientId } })
  const rejectionDetails = parseRejectionDetails(packet.rejectionDetails)
  const clinicalCorrectionLoop = isClinicalFamilyCorrectionLoop({
    clientStatus: client?.status ?? '',
    packetStatus: packet.status,
    rejectionDetails,
  })

  if (packet.status !== 'PENDING_CLIENT_SUBMISSION' && !clinicalCorrectionLoop) {
    return {
      success: false,
      error: 'This packet has already been submitted and is with our team for review.',
    }
  }

  const existingFormData = parsePacketFormData(packet.formData)
  const parsed: Record<string, unknown> =
    formData && typeof formData === 'object' ? formData : existingFormData
  const persistedFormData = formData
    ? preserveClinicalReviewApprovals(
        { ...existingFormData, ...parsed },
        existingFormData,
      )
    : existingFormData

  const evaluation = clinicalCorrectionLoop
    ? evaluateClinicalCorrectionSubmit(persistedFormData, rejectionDetails)
    : evaluatePacketFields(parsed)
  if (!evaluation.complete) {
    const missingCount =
      evaluation.missingForm01.length +
      evaluation.missingForm02.length +
      evaluation.missingDocs.length
    return {
      success: false,
      error: clinicalCorrectionLoop
        ? `Please upload the ${missingCount} document${missingCount === 1 ? '' : 's'} Clinical Support asked you to replace, then submit again.`
        : `Almost there — ${missingCount} required item${missingCount === 1 ? ' is' : 's are'} still missing. Please finish the intake form, consents, and document uploads, then submit again.`,
      missingForm01: evaluation.missingForm01,
      missingForm02: evaluation.missingForm02,
      missingDocs: evaluation.missingDocs,
    }
  }

  try {
    const nextPacketStatus = packetStatusAfterClinicalCorrectionResubmit(
      client?.status ?? '',
    )
    const allowedPacketStatuses = clinicalCorrectionLoop
      ? (['APPROVED', 'PENDING_CLIENT_SUBMISSION'] as const)
      : (['PENDING_CLIENT_SUBMISSION'] as const)
    const docFlagUpdates = clinicalCorrectionLoop
      ? (evaluation.flaggedDocFlags ?? {})
      : evaluation.docFlags

    const updateRes = await prisma.intakePacket.updateMany({
      where: {
        id: packet.id,
        clientId: gate.clientId,
        status: { in: [...allowedPacketStatuses] },
      },
      data: {
        ...(formData
          ? { formData: JSON.stringify(persistedFormData) }
          : {}),
        status: nextPacketStatus,
        // Intake resubmits clear flags so coordinators re-review the packet.
        // Clinical corrections keep per-document rejection flags until CSS re-approves
        // and only flip the re-uploaded document boolean(s) back to true.
        ...(clinicalCorrectionLoop ? {} : { rejectionDetails: {} }),
        ...docFlagUpdates,
      },
    })

    if (updateRes.count === 0) {
      return {
        success: false,
        error: 'This packet has already been submitted and is with our team for review.',
      }
    }

    if (client) {
      if (client.status === 'MAGIC_LINK_SENT' || client.status === 'INQUIRY') {
        await prisma.client.updateMany({
          where: {
            id: packet.clientId,
            status: { in: ['MAGIC_LINK_SENT', 'INQUIRY'] },
          },
          data: { status: 'DOCS_SUBMITTED' },
        })
      }

      if (clinicalCorrectionLoop) {
        await notifyRoles(['CLINICAL_SUPPORT'], {
          title: `Updated clinical document for ${client.firstName} ${client.lastName}`,
          message:
            'The family re-uploaded a document flagged by Clinical Support. Preview the new file and re-approve it — this case stayed on the Clinical Support queue.',
          type: 'INFO',
          linkUrl: `/client/${packet.clientId}?mode=clinical&tab=clinical`,
        }).catch(() => {})

        await notifyClient(packet.clientId, {
          title: 'Updated document received',
          message:
            'We received your updated document. Clinical Support will review it next. You do not need to wait for Intake.',
          type: 'ALERT',
        }).catch(() => {})
      } else {
        await notifyCaseTeam(
          packet.clientId,
          {
            title: `Intake packet submitted for ${client.firstName} ${client.lastName}`,
            message: 'The family has submitted all required intake forms, consents, and insurance documents for verification.',
            type: 'INFO',
            linkUrl: `/client/${packet.clientId}?tab=intake`,
          },
          true
        ).catch(() => {})

        await notifyClient(packet.clientId, {
          title: 'Intake packet received',
          message: 'Your intake packet and documents have been successfully submitted. Our intake team is reviewing them now.',
          type: 'ALERT',
        }).catch(() => {})
      }
    }

    revalidatePath('/', 'layout')
    revalidatePath(`/client/${packet.clientId}`)
    revalidatePath('/portal-case/clients')
    revalidatePath('/clinical-support/clients')
  } catch (error) {
    console.error(
      'submitMagicLinkPacket failed:',
      error instanceof Error ? error.message : 'Unknown'
    )
    return { success: false, error: 'Something went wrong while submitting. Please try again in a moment.' }
  }

  return { success: true }
}
