'use server'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  requireClientAccess,
  requireStaff,
  INTAKE_ROLES,
  CASE_COORD_ROLES,
} from '@/lib/auth-guard'
import { requireStaffOrParent, newMagicLinkExpiry } from '@/lib/magicLinkGuard'
import { updateClientCaseCoordinator } from '@/app/actions/hr'
import { writeAuditLog } from '@/lib/auditLog'
import {
  assertSingleConditionalWrite,
  buildDocumentCorrectionPatch,
  buildFormCorrectionPatch,
  buildIntakeClientProfilePatch,
  deriveMessageMutation,
  deriveReadDirection,
  intakeActionFailure,
  isIntakeReviewItemKey,
  isIntakeWriteConflict,
  isRejectableIntakeDocumentKey,
  isUuid,
  normalizeFormCorrections,
  runAuthorizedIntakeAction,
  validateBoundIntakePacket,
  validateMagicLinkCreationState,
  validateMagicLinkRotationState,
  validatePacketReadyForClinical,
  validateReviewItemAvailability,
  validateSubmittedIntakeReview,
  validateUnlockRequest,
  type IntakeActionFailure,
  type IntakeActionFailureCode,
  type IntakeActionResult,
} from './actions/intake-action-security'

const INTAKE_CLIENT_PACKET_SELECT = {
  id: true,
  status: true,
  updatedAt: true,
  intakePacket: {
    select: {
      id: true,
      clientId: true,
      status: true,
      updatedAt: true,
      magicLinkRevokedAt: true,
      clientChangeRequested: true,
      formData: true,
      rejectionDetails: true,
      intakeFormComplete: true,
      consentFormComplete: true,
      insuranceCardFrontUploaded: true,
      insuranceCardBackUploaded: true,
      medicaidCardFrontUploaded: true,
      medicaidCardBackUploaded: true,
      diagnosticEvalUploaded: true,
      physicianRxUploaded: true,
      iepUploaded: true,
      custodyDocsUploaded: true,
      priorAbaRecordsUploaded: true,
    },
  },
} as const satisfies Prisma.ClientSelect

function loadIntakeClient(clientId: string) {
  return prisma.client.findUnique({
    where: { id: clientId },
    select: INTAKE_CLIENT_PACKET_SELECT,
  })
}

function revalidateIntakeSurfaces(clientId: string) {
  revalidatePath('/', 'layout')
  revalidatePath(`/client/${clientId}`)
  revalidatePath('/portal-case')
  revalidatePath('/portal-case/clients')
  revalidatePath('/magic-link/[id]', 'page')
}

function policyFailure(result: {
  ok: false
  code: IntakeActionFailureCode
  error: string
}): IntakeActionFailure {
  return intakeActionFailure(result.code, result.error)
}

function mutationFailure(
  actionName: string,
  error: unknown,
  fallback: string
): IntakeActionFailure {
  if (isIntakeWriteConflict(error)) {
    return intakeActionFailure(
      'STALE_WRITE',
      'This intake record changed in another session. Refresh and try again.'
    )
  }
  console.error(
    `${actionName} failed:`,
    error instanceof Error ? error.name : 'UnknownError'
  )
  return intakeActionFailure('OPERATION_FAILED', fallback)
}

async function auditIntakeMutation(input: {
  actorUserId: string
  action: string
  packetId: string
  clientId: string
  meta?: Record<string, unknown>
}) {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: 'INTAKE_PACKET',
    entityId: input.packetId,
    meta: {
      clientId: input.clientId,
      ...(input.meta ?? {}),
    },
  })
}

export async function createInquiry(prevState: unknown, formData: FormData) {
  try {
    void prevState
    const gate = await requireStaff(INTAKE_ROLES)
    if (!gate.ok) return { success: false, error: gate.error }

    const firstName = String(formData.get('childFirstName') || formData.get('firstName') || '').trim()
    const lastName = String(formData.get('childLastName') || formData.get('lastName') || '').trim()
    
    const parentFirstName = String(formData.get('parentFirstName') || '').trim()
    const parentLastName = String(formData.get('parentLastName') || '').trim()
    const guardianName = `${parentFirstName} ${parentLastName}`.trim() || null

    const guardianPhone = String(formData.get('guardianPhone') || '').trim() || null
    const guardianEmail = String(formData.get('guardianEmail') || '').trim() || null
    if (!firstName || !lastName) {
      return { success: false, error: 'Child First Name and Last Name are required.' }
    }

    await prisma.client.create({
      data: {
        firstName,
        lastName,
        guardianName,
        guardianPhone,
        guardianEmail,
        status: 'INQUIRY'
      }
    })

    revalidatePath('/portal-case')
    revalidatePath('/portal-case/clients')
    return { success: true }
  } catch (error: unknown) {
    console.error('Failed to create inquiry:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create inquiry.',
    }
  }
}

export async function createIntakeClient(prevState: unknown, formData: FormData) {
  let newClient;
  void prevState

  const gate = await requireStaff(INTAKE_ROLES)
  if (!gate.ok) return { error: gate.error }

  try {
    const firstName = String(formData.get('firstName'))
    const lastName = String(formData.get('lastName'))
    const childGender = formData.get('childGender') ? String(formData.get('childGender')) : null
    const childAge = formData.get('childAge') ? parseInt(String(formData.get('childAge'))) : null
    
    const parentName = String(formData.get('parentName'))
    const parentGender = String(formData.get('parentGender'))
    const parentAddress = String(formData.get('parentAddress'))
    const guardianPhone = String(formData.get('guardianPhone'))

    if (!firstName || !lastName || !parentName || !guardianPhone) {
      return { error: 'Missing required fields.' }
    }

    newClient = await prisma.client.create({
      data: {
        firstName,
        lastName,
        childGender,
        childAge,
        guardianName: parentName,
        parentGender,
        parentAddress,
        guardianPhone,
        status: 'INQUIRY' // Initial status
      }
    })
    
  } catch (error) {
    console.error(error)
    return { error: 'Failed to create client.' }
  }

  // Redirect to the new client profile page
  redirect(`/client/${newClient.id}`)
}

export async function generateMagicLink(
  clientId: string
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId)) {
        return intakeActionFailure('INVALID_ID', 'Invalid client.')
      }

      try {
        const client = await loadIntakeClient(clientId)
        const state = validateMagicLinkCreationState(client, clientId)
        if (!state.ok) return policyFailure(state)

        const magicLinkToken = crypto.randomUUID()
        const packetId = await prisma.$transaction(
          async (tx) => {
            const clientUpdate = await tx.client.updateMany({
              where: {
                id: clientId,
                status: 'INQUIRY',
                updatedAt: client!.updatedAt,
              },
              data: { status: 'MAGIC_LINK_SENT' },
            })
            assertSingleConditionalWrite(clientUpdate.count)

            const packet = await tx.intakePacket.create({
              data: {
                clientId,
                magicLinkToken,
                magicLinkExpiresAt: newMagicLinkExpiry(),
                status: 'PENDING_CLIENT_SUBMISSION',
              },
              select: { id: true },
            })
            return packet.id
          },
          { isolationLevel: 'Serializable' }
        )

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'MAGIC_LINK_CREATED',
          packetId,
          clientId,
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'generateMagicLink',
          error,
          'Failed to generate the parent link. Please try again.'
        )
      }
    }
  )
}

/** Staff "reset link": new token + fresh expiry, clears revocation + device lock. */
export async function regenerateMagicLink(
  clientId: string,
  packetId: string
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId) || !isUuid(packetId)) {
        return intakeActionFailure(
          'INVALID_ID',
          'Invalid client or intake packet.'
        )
      }

      try {
        const client = await loadIntakeClient(clientId)
        const state = validateMagicLinkRotationState(
          client,
          clientId,
          packetId
        )
        if (!state.ok) return policyFailure(state)
        const packet = client!.intakePacket!

        const update = await prisma.intakePacket.updateMany({
          where: {
            id: packetId,
            clientId,
            status: packet.status,
            updatedAt: packet.updatedAt,
          },
          data: {
            magicLinkToken: crypto.randomUUID(),
            magicLinkExpiresAt: newMagicLinkExpiry(),
            magicLinkRevokedAt: null,
            deviceFingerprint: null,
          },
        })
        assertSingleConditionalWrite(update.count)

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'MAGIC_LINK_REGENERATED',
          packetId,
          clientId,
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'regenerateMagicLink',
          error,
          'Failed to regenerate the parent link. Please try again.'
        )
      }
    }
  )
}

/** Staff revoke: kills the live parent link immediately. */
export async function revokeMagicLink(
  packetId: string,
  clientId: string
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId) || !isUuid(packetId)) {
        return intakeActionFailure(
          'INVALID_ID',
          'Invalid client or intake packet.'
        )
      }

      try {
        const client = await loadIntakeClient(clientId)
        const binding = validateBoundIntakePacket(
          client,
          clientId,
          packetId
        )
        if (!binding.ok) return policyFailure(binding)
        const packet = client!.intakePacket!
        if (packet.magicLinkRevokedAt) return { success: true }

        const update = await prisma.intakePacket.updateMany({
          where: {
            id: packetId,
            clientId,
            updatedAt: packet.updatedAt,
            magicLinkRevokedAt: null,
          },
          data: { magicLinkRevokedAt: new Date() },
        })
        assertSingleConditionalWrite(update.count)

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'MAGIC_LINK_REVOKED',
          packetId,
          clientId,
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'revokeMagicLink',
          error,
          'Failed to revoke the parent link. Please try again.'
        )
      }
    }
  )
}

export async function sendToClinical(
  clientId: string,
  packetId: string
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId) || !isUuid(packetId)) {
        return intakeActionFailure(
          'INVALID_ID',
          'Invalid client or intake packet.'
        )
      }

      try {
        const client = await loadIntakeClient(clientId)
        const ready = validatePacketReadyForClinical(
          client,
          clientId,
          packetId
        )
        if (!ready.ok) return policyFailure(ready)
        const packet = client!.intakePacket!

        await prisma.$transaction(
          async (tx) => {
            const packetUpdate = await tx.intakePacket.updateMany({
              where: {
                id: packetId,
                clientId,
                status: 'SUBMITTED',
                updatedAt: packet.updatedAt,
              },
              data: { status: 'APPROVED' },
            })
            assertSingleConditionalWrite(packetUpdate.count)

            const clientUpdate = await tx.client.updateMany({
              where: {
                id: clientId,
                status: 'DOCS_SUBMITTED',
                updatedAt: client!.updatedAt,
              },
              data: { status: 'DOCS_APPROVED_INTAKE' },
            })
            assertSingleConditionalWrite(clientUpdate.count)
          },
          { isolationLevel: 'Serializable' }
        )

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'INTAKE_APPROVED_FOR_CLINICAL',
          packetId,
          clientId,
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'sendToClinical',
          error,
          'Failed to send the packet to Clinical. Please try again.'
        )
      }
    }
  )
}

export async function approveDocument(
  packetId: string,
  documentKey: string,
  clientId: string
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId) || !isUuid(packetId)) {
        return intakeActionFailure(
          'INVALID_ID',
          'Invalid client or intake packet.'
        )
      }
      if (!isIntakeReviewItemKey(documentKey)) {
        return intakeActionFailure(
          'INVALID_DOCUMENT_KEY',
          'Invalid intake review item.'
        )
      }

      try {
        const client = await loadIntakeClient(clientId)
        const review = validateSubmittedIntakeReview(
          client,
          clientId,
          packetId
        )
        if (!review.ok) return policyFailure(review)
        const packet = client!.intakePacket!
        const availability = validateReviewItemAvailability(
          packet,
          clientId,
          documentKey
        )
        if (!availability.ok) return policyFailure(availability)

        const packetData = {
          [documentKey]: true,
        } as Prisma.IntakePacketUpdateManyMutationInput
        const clientData: Prisma.ClientUpdateManyMutationInput =
          buildIntakeClientProfilePatch(packet.formData)

        await prisma.$transaction(
          async (tx) => {
            const liveClient = await tx.client.findUnique({
              where: { id: clientId },
              select: { status: true, updatedAt: true },
            })
            if (
              !liveClient ||
              liveClient.status !== 'DOCS_SUBMITTED' ||
              liveClient.updatedAt.getTime() !==
                client!.updatedAt.getTime()
            ) {
              assertSingleConditionalWrite(0)
            }

            const packetUpdate = await tx.intakePacket.updateMany({
              where: {
                id: packetId,
                clientId,
                status: 'SUBMITTED',
                updatedAt: packet.updatedAt,
              },
              data: packetData,
            })
            assertSingleConditionalWrite(packetUpdate.count)

            if (documentKey === 'intakeFormComplete') {
              const clientUpdate = await tx.client.updateMany({
                where: {
                  id: clientId,
                  status: 'DOCS_SUBMITTED',
                  updatedAt: client!.updatedAt,
                },
                data: clientData,
              })
              assertSingleConditionalWrite(clientUpdate.count)
            }
          },
          { isolationLevel: 'Serializable' }
        )

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'INTAKE_ITEM_APPROVED',
          packetId,
          clientId,
          meta: { documentKey },
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'approveDocument',
          error,
          'Failed to approve the intake item. Please try again.'
        )
      }
    }
  )
}

export async function rejectDocument(
  packetId: string,
  documentKey: string,
  clientId: string,
  reason: string
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId) || !isUuid(packetId)) {
        return intakeActionFailure(
          'INVALID_ID',
          'Invalid client or intake packet.'
        )
      }
      if (!isRejectableIntakeDocumentKey(documentKey)) {
        return intakeActionFailure(
          'INVALID_DOCUMENT_KEY',
          'Invalid document key.'
        )
      }

      try {
        const client = await loadIntakeClient(clientId)
        const review = validateSubmittedIntakeReview(
          client,
          clientId,
          packetId
        )
        if (!review.ok) return policyFailure(review)
        const packet = client!.intakePacket!
        const availability = validateReviewItemAvailability(
          packet,
          clientId,
          documentKey
        )
        if (!availability.ok) return policyFailure(availability)

        const correction = buildDocumentCorrectionPatch(
          packet,
          documentKey,
          reason
        )
        if (!correction.ok) return policyFailure(correction)
        const data = correction.value
        const updateData = {
          [documentKey]: false,
          formData: data.formData as Prisma.InputJsonValue,
          rejectionDetails:
            data.rejectionDetails as Prisma.InputJsonValue,
          status: 'PENDING_CLIENT_SUBMISSION',
        } as Prisma.IntakePacketUpdateManyMutationInput

        const update = await prisma.intakePacket.updateMany({
          where: {
            id: packetId,
            clientId,
            status: 'SUBMITTED',
            updatedAt: packet.updatedAt,
          },
          data: updateData,
        })
        assertSingleConditionalWrite(update.count)

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'INTAKE_DOCUMENT_CORRECTION_REQUESTED',
          packetId,
          clientId,
          meta: { documentKey },
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'rejectDocument',
          error,
          'Failed to request the document correction. Please try again.'
        )
      }
    }
  )
}

export async function rejectFormField(
  packetId: string,
  clientId: string,
  fieldId: string,
  reason: string
): Promise<IntakeActionResult> {
  return rejectFormFieldsBulk(packetId, clientId, [
    { fieldId, reason },
  ])
}

export async function rejectFormFieldsBulk(
  packetId: string,
  clientId: string,
  fields: { fieldId: string; reason: string }[]
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId) || !isUuid(packetId)) {
        return intakeActionFailure(
          'INVALID_ID',
          'Invalid client or intake packet.'
        )
      }
      const normalized = normalizeFormCorrections(fields)
      if (!normalized.ok) return policyFailure(normalized)

      try {
        const client = await loadIntakeClient(clientId)
        const review = validateSubmittedIntakeReview(
          client,
          clientId,
          packetId
        )
        if (!review.ok) return policyFailure(review)
        const packet = client!.intakePacket!

        const correction = buildFormCorrectionPatch(
          packet,
          normalized.value
        )
        if (!correction.ok) return policyFailure(correction)
        const data = correction.value

        const update = await prisma.intakePacket.updateMany({
          where: {
            id: packetId,
            clientId,
            status: 'SUBMITTED',
            updatedAt: packet.updatedAt,
          },
          data: {
            formData: data.formData as Prisma.InputJsonValue,
            rejectionDetails:
              data.rejectionDetails as Prisma.InputJsonValue,
            status: 'PENDING_CLIENT_SUBMISSION',
            intakeFormComplete: Boolean(data.intakeFormComplete),
            consentFormComplete: Boolean(data.consentFormComplete),
          },
        })
        assertSingleConditionalWrite(update.count)

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'INTAKE_FORM_CORRECTION_REQUESTED',
          packetId,
          clientId,
          meta: { correctionCount: normalized.value.length },
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'rejectFormFieldsBulk',
          error,
          'Failed to request the form corrections. Please try again.'
        )
      }
    }
  )
}

export async function unlockPacket(
  packetId: string,
  clientId: string
): Promise<IntakeActionResult> {
  return runAuthorizedIntakeAction(
    () => requireStaff(INTAKE_ROLES),
    async (actor) => {
      if (!isUuid(clientId) || !isUuid(packetId)) {
        return intakeActionFailure(
          'INVALID_ID',
          'Invalid client or intake packet.'
        )
      }

      try {
        const client = await loadIntakeClient(clientId)
        const state = validateUnlockRequest(
          client,
          clientId,
          packetId
        )
        if (!state.ok) return policyFailure(state)
        const packet = client!.intakePacket!

        const update = await prisma.intakePacket.updateMany({
          where: {
            id: packetId,
            clientId,
            status: 'SUBMITTED',
            updatedAt: packet.updatedAt,
            clientChangeRequested: true,
          },
          data: {
            status: 'PENDING_CLIENT_SUBMISSION',
            clientChangeRequested: false,
            clientChangeNotes: null,
          },
        })
        assertSingleConditionalWrite(update.count)

        await auditIntakeMutation({
          actorUserId: actor.id,
          action: 'INTAKE_PARENT_EDIT_UNLOCKED',
          packetId,
          clientId,
        })
        revalidateIntakeSurfaces(clientId)
        return { success: true }
      } catch (error) {
        return mutationFailure(
          'unlockPacket',
          error,
          'Failed to unlock the intake packet. Please try again.'
        )
      }
    }
  )
}

export async function assignClinicalTeam(clientId: string, bcbaId: string, caseCoordinatorId: string) {
  const gate = await requireStaff(INTAKE_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  // This combined legacy writer cannot express two independent expected-current
  // values or operation-specific ownership. Keep the export non-mutating so a
  // dormant caller cannot bypass the canonical assignment actions.
  void clientId;
  void bcbaId;
  void caseCoordinatorId;
  return {
    success: false,
    error:
      'Combined clinical-team assignment is disabled. Use Clinical BCBA assignment and the client Assignment tab.',
  };
}

export async function getClinicalStaff() {
  const gate = await requireStaff()
  if (!gate.ok) return { bcbas: [], caseCoordinators: [] }

  const bcbas = await prisma.user.findMany({
    where: { role: 'BCBA', isActive: true },
    select: { id: true, firstName: true, lastName: true }
  });
  
  const caseCoordinators = await prisma.user.findMany({
    where: { role: 'CASE_COORDINATOR', isActive: true },
    select: { id: true, firstName: true, lastName: true }
  });

  return { bcbas, caseCoordinators };
}

export async function sendClientMessage(
  clientId: string,
  content: string
): Promise<IntakeActionResult> {
  const gate = await requireStaffOrParent({ clientId })
  if (!gate.ok) {
    return intakeActionFailure('AUTHORIZATION_FAILED', gate.error)
  }
  if (!isUuid(clientId)) {
    return intakeActionFailure('INVALID_ID', 'Invalid client.')
  }
  if (gate.via === 'parent' && gate.clientId !== clientId) {
    return intakeActionFailure(
      'PACKET_CLIENT_MISMATCH',
      'This portal cannot access the selected client.'
    )
  }
  if (gate.via === 'staff') {
    const access = await requireClientAccess(clientId)
    if (!access.ok) {
      return intakeActionFailure(
        'AUTHORIZATION_FAILED',
        access.error
      )
    }
  }

  const messageData = deriveMessageMutation(gate.via, content)
  if (!messageData.ok) return policyFailure(messageData)

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    })
    if (!client) {
      return intakeActionFailure('NOT_FOUND', 'Client not found.')
    }

    const message = await prisma.clientMessage.create({
      data: {
        clientId,
        ...messageData.value,
      },
      select: { id: true },
    })
    await writeAuditLog({
      actorUserId: gate.via === 'staff' ? gate.user.id : null,
      action: 'MESSAGE_SENT',
      entityType: 'CLIENT_MESSAGE',
      entityId: message.id,
      meta: {
        clientId,
        senderType: gate.via,
      },
    })

    revalidatePath(`/client/${clientId}`)
    revalidatePath('/magic-link/[id]', 'page')
    return { success: true }
  } catch (error) {
    return mutationFailure(
      'sendClientMessage',
      error,
      'Failed to send the message. Please try again.'
    )
  }
}

export async function markClientMessagesAsRead(
  clientId: string
): Promise<IntakeActionResult> {
  const gate = await requireStaffOrParent({ clientId })
  if (!gate.ok) {
    return intakeActionFailure('AUTHORIZATION_FAILED', gate.error)
  }
  if (!isUuid(clientId)) {
    return intakeActionFailure('INVALID_ID', 'Invalid client.')
  }
  if (gate.via === 'parent' && gate.clientId !== clientId) {
    return intakeActionFailure(
      'PACKET_CLIENT_MISMATCH',
      'This portal cannot access the selected client.'
    )
  }
  if (gate.via === 'staff') {
    const access = await requireClientAccess(clientId)
    if (!access.ok) {
      return intakeActionFailure(
        'AUTHORIZATION_FAILED',
        access.error
      )
    }
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    })
    if (!client) {
      return intakeActionFailure('NOT_FOUND', 'Client not found.')
    }

    await prisma.clientMessage.updateMany({
      where: {
        clientId,
        isFromClient: deriveReadDirection(gate.via),
        readAt: null,
      },
      data: { readAt: new Date() },
    })
    revalidatePath(`/client/${clientId}`)
    revalidatePath('/magic-link/[id]', 'page')
    return { success: true }
  } catch (error) {
    return mutationFailure(
      'markClientMessagesAsRead',
      error,
      'Failed to mark messages as read. Please try again.'
    )
  }
}

export async function assignCaseCoordinator(
  clientId: string,
  caseCoordinatorId: string | null,
  expectedCaseCoordinatorId: string | null
) {
  const gate = await requireStaff(CASE_COORD_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  return updateClientCaseCoordinator({
    clientId,
    caseCoordinatorId,
    expectedCaseCoordinatorId,
  });
}

export async function approveRbtCandidate(clientId: string) {
  const gate = await requireStaff(CASE_COORD_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  void clientId;
  return {
    success: false as const,
    error:
      'Legacy RBT approval is disabled. Record the parent decision on the selected Job Board application.',
  };
}

export async function rejectRbtCandidate(clientId: string) {
  const gate = await requireStaff(CASE_COORD_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  void clientId;
  return {
    success: false as const,
    error:
      'Legacy RBT rejection is disabled. Decline the selected Job Board application so assignment and opening state stay consistent.',
  };
}
