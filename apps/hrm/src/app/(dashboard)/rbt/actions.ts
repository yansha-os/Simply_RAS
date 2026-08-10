'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function logSession(prevState: any, formData: FormData) {
  try {
    const clientId = String(formData.get('clientId'))
    const rbtId = String(formData.get('rbtId'))
    const bcbaId = String(formData.get('bcbaId'))
    
    // Hardcoding a 2-hour session for demonstration
    const scheduledStart = new Date()
    const scheduledEnd = new Date(scheduledStart.getTime() + (2 * 60 * 60 * 1000))

    if (!clientId || !rbtId) {
      return { error: 'Missing client or RBT ID.' }
    }

    // Step 7: First Session & Active Therapy -> Create Tracker Session Note
    await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          clientId,
          rbtId,
          bcbaId: bcbaId !== 'undefined' ? bcbaId : null,
          status: 'COMPLETED',
          scheduledStart,
          scheduledEnd,
          cptCode: '97153',
        }
      })

      await tx.sessionNote.create({
        data: {
          sessionId: session.id,
          // No PHI stored.
          clinicalContent: 'Session completed and documented in Artemis EMR.',
          // RBT inherently signs it when confirming
          rbtSigned: true, 
          parentSigned: false,
          bcbaSigned: false,
          isConverted: false
        }
      })
    })

    revalidatePath('/rbt')
    revalidatePath('/case')
    revalidatePath('/notes')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: 'Failed to log session.' }
  }
}

export async function fixDeficiency(prevState: any, formData: FormData) {
  try {
    const deficiencyId = String(formData.get('deficiencyId'))
    const noteId = String(formData.get('noteId'))

    await prisma.$transaction(async (tx) => {
      // 1. Update the note tracking record
      await tx.sessionNote.update({
        where: { id: noteId },
        data: {
          rbtSigned: true // They confirm they fixed it in Artemis
        }
      })

      // 2. Mark deficiency resolved
      await tx.noteDeficiency.update({
        where: { id: deficiencyId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date()
        }
      })
    })

    revalidatePath('/rbt')
    revalidatePath('/case')
    revalidatePath('/notes')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: 'Failed to fix deficiency.' }
  }
}
