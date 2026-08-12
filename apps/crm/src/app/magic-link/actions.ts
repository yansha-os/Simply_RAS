'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireParentPacketAccess } from '@/lib/magicLinkGuard'

/**
 * Server-side mirror of the ContinuousIntakeForm requirement rules.
 * Flags are derived from what the parent actually filled in / uploaded —
 * nothing is auto-completed (readiness Blocker 3).
 */
function evaluatePacketFields(formData: Record<string, unknown>) {
  const has = (key: string) => {
    const v = formData[key]
    return v !== undefined && v !== null && String(v).trim() !== ''
  }

  const form01Required = [
    'childName', 'dob', 'sexAtBirth', 'primaryLang', 'elopement',
    'g1Name', 'g1Phone', 'g1Email', 'g1ContactPref',
    'custodyType', 'custodyDocAttached',
    'priInsCompany', 'priInsMemberId', 'hasSecondPlan', 'hasMedicaid',
    'hasDiagnosis', 'hasReferral', 'hasPriorABA', 'hasIEP',
    'prefLocation', 'em1Name', 'em1Phone', 'emPermission',
    'attestationAgree', 'attestationName', 'attestationDate',
  ]
  if (!has('childLivesWithParents')) form01Required.push('childAddress')
  if (formData['hasMedicaid'] === 'Yes') form01Required.push('medicaidMCO')
  if (formData['hasDiagnosis'] === 'Yes') {
    form01Required.push('dxInitialDate', 'dxRecentDate', 'dxProviderName', 'dxPracticeName')
  }
  if (formData['hasReferral'] === 'Yes') {
    form01Required.push('referralProvider', 'referralDate', 'referralExpires')
    if (formData['referralExpires'] === 'Yes') form01Required.push('referralExpDate')
  }
  if (formData['prefLocation'] === 'Home') form01Required.push('quietSpace', 'hasPets', 'othersHome')

  const form02Required = [
    'sig1Name',
    'cpt97151', 'cpt97153', 'cpt97155', 'cpt97156', 'cpt97154',
    'locHome', 'locClinic', 'locCommunity', 'locSchool',
    'mediaClinical', 'mediaTraining', 'mediaPhotos', 'mediaMarketing', 'mediaObservation',
    'hipaaAck', 'phiInsurance', 'phiBilling', 'phiPcp', 'phiDiagnosing', 'phiSchool', 'phiOtherTherapies',
    'aobInitial', 'attendanceInitial',
    'commPhone', 'commSms', 'commEmail', 'commPortal',
    'emergencyInitial', 'eSignInitial',
  ]

  const missingForm01 = form01Required.filter((f) => !has(f))
  const missingForm02 = form02Required.filter((f) => !has(f))
  if (!has('telehealthConsent') && !has('telehealthDecline')) {
    missingForm02.push('telehealthConsent/telehealthDecline')
  }

  const hasMedicaid =
    has('hasMedicaid') && formData['hasMedicaid'] !== 'No' && formData['hasMedicaid'] !== 'Not Sure'
  const hasCustodyDoc =
    formData['custodyDocAttached'] === 'Yes — Attached' ||
    formData['custodyDocAttached'] === 'Yes — Will Provide'
  const hasIEP = formData['hasIEP'] === 'Yes — Attached' || formData['hasIEP'] === 'Yes — Will Provide'
  const hasPriorABA = formData['hasPriorABA'] === 'Yes'

  const requiredDocs = ['docInsuranceFront', 'docInsuranceBack', 'docEval', 'docReferral']
  if (hasMedicaid) requiredDocs.push('docMedicaidFront', 'docMedicaidBack')
  if (hasIEP) requiredDocs.push('docIEP')
  if (hasCustodyDoc) requiredDocs.push('docCustody')
  if (hasPriorABA) requiredDocs.push('docPriorABA')

  const missingDocs = requiredDocs.filter((d) => !has(d))

  return {
    complete: missingForm01.length === 0 && missingForm02.length === 0 && missingDocs.length === 0,
    missingForm01,
    missingForm02,
    missingDocs,
    // Per-document flags derived from actual uploads
    docFlags: {
      intakeFormComplete: missingForm01.length === 0,
      consentFormComplete: missingForm02.length === 0,
      insuranceCardFrontUploaded: has('docInsuranceFront'),
      insuranceCardBackUploaded: has('docInsuranceBack'),
      medicaidCardFrontUploaded: has('docMedicaidFront'),
      medicaidCardBackUploaded: has('docMedicaidBack'),
      diagnosticEvalUploaded: has('docEval'),
      physicianRxUploaded: has('docReferral'),
      iepUploaded: has('docIEP'),
      custodyDocsUploaded: has('docCustody'),
      priorAbaRecordsUploaded: has('docPriorABA'),
    },
  }
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
 * On resubmit after staff rejections, rejectionDetails is wiped and the
 * packet returns to SUBMITTED (intake-workflow-map rejection loop step 3).
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
  if (!packet) return { success: false, error: 'Intake packet not found.' }
  if (packet.status !== 'PENDING_CLIENT_SUBMISSION') {
    return {
      success: false,
      error: 'This packet has already been submitted and is with our team for review.',
    }
  }

  let parsed: Record<string, unknown> = {}
  if (formData && typeof formData === 'object') {
    parsed = formData
  } else {
    try {
      const raw = typeof packet.formData === 'string' ? JSON.parse(packet.formData) : packet.formData || {}
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      parsed = {}
    }
  }

  const evaluation = evaluatePacketFields(parsed)
  if (!evaluation.complete) {
    const missingCount =
      evaluation.missingForm01.length +
      evaluation.missingForm02.length +
      evaluation.missingDocs.length
    return {
      success: false,
      error: `Almost there — ${missingCount} required item${missingCount === 1 ? ' is' : 's are'} still missing. Please finish the intake form, consents, and document uploads, then submit again.`,
      missingForm01: evaluation.missingForm01,
      missingForm02: evaluation.missingForm02,
      missingDocs: evaluation.missingDocs,
    }
  }

  try {
    await prisma.intakePacket.update({
      where: { id: packet.id },
      data: {
        // Persist the exact snapshot that passed validation when provided.
        ...(formData ? { formData: JSON.stringify(parsed) } : {}),
        status: 'SUBMITTED',
        rejectionDetails: {},
        ...evaluation.docFlags,
      },
    })

    const client = await prisma.client.findUnique({ where: { id: packet.clientId } })
    if (client && (client.status === 'MAGIC_LINK_SENT' || client.status === 'INQUIRY')) {
      await prisma.client.update({
        where: { id: packet.clientId },
        data: { status: 'DOCS_SUBMITTED' },
      })
    }

    revalidatePath('/', 'layout')
    revalidatePath(`/client/${packet.clientId}`)
    revalidatePath('/portal-case/clients')
  } catch (error) {
    console.error(
      'submitMagicLinkPacket failed:',
      error instanceof Error ? error.message : 'Unknown'
    )
    return { success: false, error: 'Something went wrong while submitting. Please try again in a moment.' }
  }

  return { success: true }
}
