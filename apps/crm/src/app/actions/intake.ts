'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function saveIntakeProgress(packetId: string, formData: any) {
  try {
    await prisma.intakePacket.update({
      where: { id: packetId },
      data: {
        formData: JSON.stringify(formData)
      }
    });
    return { success: true };
  } catch (e) {
    console.error("Failed to save intake progress:", e);
    return { success: false, error: e };
  }
}

export async function submitForm01(packetId: string, formData: any) {
  try {
    await prisma.intakePacket.update({
      where: { id: packetId },
      data: {
        formData: JSON.stringify(formData),
        intakeFormComplete: true
      }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
}

export async function submitForm02(packetId: string, formData: any) {
  try {
    await prisma.intakePacket.update({
      where: { id: packetId },
      data: {
        formData: JSON.stringify(formData),
        consentFormComplete: true
      }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
}

export async function submitIntakePacket(packetId: string, formData: any) {
  try {
    console.log("==DEBUG== submitIntakePacket called with packetId:", packetId);
    
    const existing = await prisma.intakePacket.findUnique({ where: { id: packetId } });
    if (existing?.status !== 'PENDING_CLIENT_SUBMISSION') {
      return { success: false, error: 'Packet is already submitted or locked.' };
    }

    const packet = await prisma.intakePacket.update({
      where: { id: packetId },
      data: {
        formData: JSON.stringify(formData),
        status: 'SUBMITTED',
        rejectionDetails: {}
      }
    });

    console.log("==DEBUG== updated packet:", packet.status);

    const client = await prisma.client.findUnique({ where: { id: packet.clientId } });
    
    // Only move to DOCS_SUBMITTED if they aren't already past it
    if (client && (client.status === 'MAGIC_LINK_SENT' || client.status === 'INQUIRY')) {
      await prisma.client.update({
        where: { id: packet.clientId },
        data: { status: 'DOCS_SUBMITTED' }
      });
      console.log("==DEBUG== updated client status to DOCS_SUBMITTED");
    } else {
      console.log(`==DEBUG== kept client status as ${client?.status}`);
    }
    
    console.log("==DEBUG== updated client status to DOCS_SUBMITTED");

    revalidatePath('/', 'layout');
    revalidatePath(`/client/${packet.clientId}`); // Specific path revalidation
    revalidatePath('/portal-case/clients'); // Master pipeline path revalidation

    return { success: true };
  } catch (e) {
    console.error("==DEBUG== Failed to submit intake packet:", e instanceof Error ? e.message : e);
    return { success: false, error: e instanceof Error ? e.message : e };
  }
}

export async function requestClientChanges(token: string, notes: string) {
  const packet = await prisma.intakePacket.findUnique({
    where: { magicLinkToken: token }
  });

  if (!packet) return { error: "Packet not found" };

  await prisma.intakePacket.update({
    where: { magicLinkToken: token },
    data: {
      clientChangeRequested: true,
      clientChangeNotes: notes
    }
  });
  
  revalidatePath('/magic-link/[id]', 'page');
  return { success: true };
}

export async function signTreatmentPlan(clientId: string, parentSignatureName: string) {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return { success: false, error: "Client not found" };

    const treatmentPlan = client.treatmentPlan ? JSON.parse(JSON.stringify(client.treatmentPlan)) : {};
    treatmentPlan.parentSignature = parentSignatureName;
    treatmentPlan.parentSignatureDate = new Date().toISOString();

    await prisma.client.update({
      where: { id: clientId },
      data: { treatmentPlan }
    });
    
    revalidatePath(`/client/${clientId}`);
    return { success: true };
  } catch (e) {
    console.error("Failed to sign treatment plan:", e);
    return { success: false, error: e };
  }
}

export async function saveClientSchedule(clientId: string, schedule: any, preferences?: any) {
  try {
    const client = await prisma.client.findUnique({ 
      where: { id: clientId },
      include: { intakePacket: true }
    });
    if (!client) return { success: false, error: "Client not found" };

    const treatmentPlan = client.treatmentPlan ? JSON.parse(JSON.stringify(client.treatmentPlan)) : {};
    treatmentPlan.preferredSchedule = schedule;
    if (preferences) {
      treatmentPlan.staffingPreferences = preferences;
    }

    const dataToUpdate: any = { treatmentPlan };
    if (client.status === 'TX_PA_APPROVED') {
      dataToUpdate.status = 'STAFFING_PENDING';
    }

    await prisma.client.update({
      where: { id: clientId },
      data: dataToUpdate
    });
    
    revalidatePath(`/client/${clientId}`);
    if (client.intakePacket?.magicLinkToken) {
      revalidatePath(`/magic-link/${client.intakePacket.magicLinkToken}`);
    }
    return { success: true };
  } catch (e) {
    console.error("Failed to save client schedule:", e);
    return { success: false, error: e };
  }
}

