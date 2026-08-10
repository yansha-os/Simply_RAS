'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function verifyDocuments(clientId: string) {
  // Clinical Support verifies the documents are complete and accurate before PA submits for Assessment
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'PA_SUBMITTED' } // Passing it back to Intake/PA to initiate the 97151 Auth
    })

    revalidatePath('/clinical-support')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: 'Failed to verify documents.' }
  }
}

export async function submitTreatmentPacket(clientId: string) {
  // Clinical Support assembled the BCBA's treatment plan and sends it to PA for Treatment Auth
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'PA_SUBMITTED' } // Passing it back to Intake/PA to initiate the 97153 Auth
    })

    revalidatePath('/clinical-support')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: 'Failed to submit packet.' }
  }
}
