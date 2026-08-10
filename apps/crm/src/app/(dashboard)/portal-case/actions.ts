'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createInquiry(prevState: any, formData: FormData) {
  try {
    const firstName = String(formData.get('childFirstName') || formData.get('firstName') || '').trim()
    const lastName = String(formData.get('childLastName') || formData.get('lastName') || '').trim()
    
    const parentFirstName = String(formData.get('parentFirstName') || '').trim()
    const parentLastName = String(formData.get('parentLastName') || '').trim()
    const guardianName = `${parentFirstName} ${parentLastName}`.trim() || null

    const guardianPhone = String(formData.get('guardianPhone') || '').trim() || null
    const guardianEmail = String(formData.get('guardianEmail') || '').trim() || null
    const preferredLanguage = String(formData.get('preferredLanguage') || 'English').trim()

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
  } catch (error: any) {
    console.error('Failed to create inquiry:', error)
    return { success: false, error: error.message || 'Failed to create inquiry.' }
  }
}

export async function createIntakeClient(prevState: any, formData: FormData) {
  let newClient;
  
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

export async function generateMagicLink(formData: FormData) {
  const clientId = String(formData.get('clientId'))
  const magicLinkToken = crypto.randomUUID()

  await prisma.intakePacket.create({
    data: {
      clientId,
      magicLinkToken,
      status: 'PENDING_CLIENT_SUBMISSION'
    }
  })

  await prisma.client.update({
    where: { id: clientId },
    data: { status: 'MAGIC_LINK_SENT' }
  })

  revalidatePath(`/client/${clientId}`)
}

export async function regenerateMagicLink(formData: FormData) {
  const packetId = String(formData.get('packetId'))
  const clientId = String(formData.get('clientId'))
  const newMagicLinkToken = crypto.randomUUID()

  await prisma.intakePacket.update({
    where: { id: packetId },
    data: { magicLinkToken: newMagicLinkToken }
  })

  revalidatePath(`/client/${clientId}`)
}

export async function sendToClinical(formData: FormData) {
  const packetId = String(formData.get('packetId'))
  const clientId = String(formData.get('clientId'))

  await prisma.intakePacket.update({
    where: { id: packetId },
    data: { status: 'APPROVED' }
  })

  await prisma.client.update({
    where: { id: clientId },
    data: { status: 'DOCS_APPROVED_INTAKE' }
  })

  revalidatePath(`/client/${clientId}`)
  redirect('/portal-case/clients')
}

export async function approveDocument(packetId: string, documentKey: string, clientId: string) {
  const packet = await prisma.intakePacket.update({
    where: { id: packetId },
    data: { [documentKey]: true }
  });

  if (documentKey === 'intakeFormComplete') {
    let parsed1 = typeof packet.formData === 'string' ? JSON.parse(packet.formData) : (packet.formData || {});
    let formData = typeof parsed1 === 'string' ? JSON.parse(parsed1) : parsed1;

    // Calculate age from DOB
    let childAge = null;
    let dateOfBirth = null;
    if (formData.dob) {
      dateOfBirth = new Date(formData.dob);
      const diff = Date.now() - dateOfBirth.getTime();
      childAge = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    }

    // Split childName into firstName, lastName
    let firstName = undefined;
    let lastName = undefined;
    if (formData.childName) {
      const parts = formData.childName.trim().split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ') || '';
    }

    // Prepare data
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    if (childAge !== null) updateData.childAge = childAge;
    
    if (formData.sexAtBirth) updateData.childGender = formData.sexAtBirth;
    
    if (formData.priInsCompany) updateData.insurancePayer = formData.priInsCompany;
    if (formData.priInsMemberId) updateData.memberId = formData.priInsMemberId;
    if (formData.medicaidId) updateData.medicaidId = formData.medicaidId;

    if (formData.g1Name) updateData.guardianName = formData.g1Name;
    if (formData.g1Phone) updateData.guardianPhone = formData.g1Phone;
    if (formData.g1Email) updateData.guardianEmail = formData.g1Email;
    
    // Address format
    if (formData.g1Address) {
      updateData.parentAddress = formData.g1Address;
    }

    await prisma.client.update({
      where: { id: clientId },
      data: updateData
    });
  }

  revalidatePath('/client');
  revalidatePath(`/client/${clientId}`);
}

export async function rejectDocument(packetId: string, documentKey: string, clientId: string, reason: string) {
  const packet = await prisma.intakePacket.findUnique({ where: { id: packetId } })
  
  if (!packet) return;

  const currentDetails = typeof packet.rejectionDetails === 'object' && packet.rejectionDetails !== null 
    ? (packet.rejectionDetails as Record<string, string>) 
    : {};

  currentDetails[documentKey] = reason;

  // Clear the formData so the client can re-upload
  let parsed1 = typeof packet.formData === 'string' ? JSON.parse(packet.formData) : (packet.formData || {});
  let formData = typeof parsed1 === 'string' ? JSON.parse(parsed1) : parsed1;
  
  const uploadMap: Record<string, string> = {
    insuranceCardFrontUploaded: 'docInsuranceFront',
    insuranceCardBackUploaded: 'docInsuranceBack',
    medicaidCardFrontUploaded: 'docMedicaidFront',
    medicaidCardBackUploaded: 'docMedicaidBack',
    diagnosticEvalUploaded: 'docEval',
    physicianRxUploaded: 'docReferral',
    iepUploaded: 'docIEP',
    custodyDocsUploaded: 'docCustody',
    priorAbaRecordsUploaded: 'docPriorABA'
  };
  
  const formKey = uploadMap[documentKey];
  if (formKey) {
    delete formData[formKey];
  }

  await prisma.intakePacket.update({
    where: { id: packetId },
    data: { 
      [documentKey]: false,
      rejectionDetails: currentDetails,
      formData: formData,
      status: 'PENDING_CLIENT_SUBMISSION'
    }
  })
  
  revalidatePath('/client/[id]', 'page');
  revalidatePath('/magic-link/[id]', 'page');
}

export async function rejectFormField(packetId: string, fieldId: string, reason: string) {
  return rejectFormFieldsBulk(packetId, [{ fieldId, reason }]);
}

export async function rejectFormFieldsBulk(packetId: string, fields: { fieldId: string, reason: string }[]) {
  const packet = await prisma.intakePacket.findUnique({ where: { id: packetId } });
  if (!packet) return;

  const currentDetails = typeof packet.rejectionDetails === 'object' && packet.rejectionDetails !== null 
    ? (packet.rejectionDetails as Record<string, string>) 
    : {};

  let parsed2 = typeof packet.formData === 'string' ? JSON.parse(packet.formData) : (packet.formData || {});
  let formData = typeof parsed2 === 'string' ? JSON.parse(parsed2) : parsed2;
  
  fields.forEach(({ fieldId, reason }) => {
    currentDetails[`formField_${fieldId}`] = reason;
    delete formData[fieldId];
  });

  await prisma.intakePacket.update({
    where: { id: packetId },
    data: { 
      formData,
      rejectionDetails: currentDetails,
      status: 'PENDING_CLIENT_SUBMISSION',
    }
  });
  
  revalidatePath('/client/[id]', 'page');
  revalidatePath('/magic-link/[id]', 'page');
}

export async function unlockPacket(packetId: string) {
  await prisma.intakePacket.update({
    where: { id: packetId },
    data: { 
      status: 'PENDING_CLIENT_SUBMISSION',
      clientChangeRequested: false,
      clientChangeNotes: null
    }
  });
  
  revalidatePath('/client/[id]', 'page');
  revalidatePath('/magic-link/[id]', 'page');
}

export async function assignClinicalTeam(clientId: string, bcbaId: string, caseCoordinatorId: string) {
  let isSuccess = false;
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        bcbaId,
        caseCoordinatorId,
        status: 'ASSESSMENT_SCHEDULED'
      }
    });
    
    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-case/clients');
    isSuccess = true;
  } catch (error: any) {
    console.error('Failed to assign clinical team:', error);
    return { success: false, error: error.message };
  }
  
  if (isSuccess) redirect('/portal-case/clients');
}

export async function getClinicalStaff() {
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

export async function sendClientMessage(clientId: string, content: string, isFromClient: boolean, senderName: string) {
  try {
    await prisma.clientMessage.create({
      data: {
        clientId,
        content,
        isFromClient,
        senderName
      }
    });
    revalidatePath(`/client/${clientId}`);
    revalidatePath('/magic-link/[id]', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send message:', error);
    return { success: false, error: error.message };
  }
}

export async function markClientMessagesAsRead(clientId: string, isFromClient: boolean) {
  try {
    await prisma.clientMessage.updateMany({
      where: {
        clientId,
        isFromClient,
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });
    revalidatePath(`/client/${clientId}`);
    revalidatePath('/magic-link/[id]', 'page');
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export async function assignCaseCoordinator(clientId: string, caseCoordinatorId: string) {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return { success: false, error: 'Client not found.' };

    const data: any = { caseCoordinatorId };
    if (client.status === 'STAFFING_PENDING' && client.bcbaId && client.rbtId && client.rbtApproved) {
      data.status = 'ACTIVE';
    }

    await prisma.client.update({
      where: { id: clientId },
      data
    });

    await prisma.clientMessage.deleteMany({
      where: { clientId }
    });
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Failed to assign coordinator:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to assign Case Coordinator.' };
  }
}

export async function approveRbtCandidate(clientId: string) {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return { success: false, error: 'Client not found.' };

    const data: any = { rbtApproved: true };
    if (client.status === 'STAFFING_PENDING' && client.bcbaId && client.caseCoordinatorId) {
      data.status = 'ACTIVE';
    }

    await prisma.client.update({
      where: { id: clientId },
      data
    });
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Failed to approve RBT candidate:', error);
    return { success: false, error: 'Failed to approve RBT candidate.' };
  }
}

export async function rejectRbtCandidate(clientId: string) {
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        rbtId: null,
        rbtApproved: false
      }
    });
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error('Failed to reject RBT candidate:', error);
    return { success: false, error: 'Failed to reject RBT candidate.' };
  }
}
