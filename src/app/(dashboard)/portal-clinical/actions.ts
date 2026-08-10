'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function approveClinicalDocs(formData: FormData) {
  const clientId = String(formData.get('clientId'));

  await prisma.client.update({
    where: { id: clientId },
    data: { status: 'CLINICAL_REVIEW_APPROVED' }
  });

  revalidatePath('/portal-clinical');
  revalidatePath(`/client/${clientId}`);
}

export async function rejectClinicalDocs(formData: FormData) {
  const packetId = String(formData.get('packetId'));
  const clientId = String(formData.get('clientId'));
  const notes = String(formData.get('notes'));

  await prisma.intakePacket.update({
    where: { id: packetId },
    data: { 
      status: 'REJECTED_BY_CLINICAL',
      rejectionNotes: notes
    }
  });

  await prisma.client.update({
    where: { id: clientId },
    data: { status: 'DOCS_SUBMITTED' } // Back to Intake review
  });

  revalidatePath('/portal-clinical');
  revalidatePath(`/client/${clientId}`);
}

export async function assignBcba(clientId: string, bcbaId: string) {
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: { bcbaId }
    });

    revalidatePath('/portal-clinical');
    revalidatePath('/portal-clinical/bcbas');
    revalidatePath(`/client/${clientId}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateTreatmentPlanStatus(clientId: string, status: any) {
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: { status }
    });

    revalidatePath('/portal-clinical');
    revalidatePath('/portal-clinical/bcbas');
    revalidatePath(`/client/${clientId}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
