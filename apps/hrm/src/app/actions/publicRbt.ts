'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface RbtApplicationInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode: string;
  gender: string;
  ethnicity: string;
  rbtStatus: string;
  bacbNumber?: string;
  cprStatus?: string;
  preferredBoroughs: string[];
  availabilityHours: string[];
  isAdult: boolean;
  backgroundCheckConsent: boolean;
  hasTransportation: boolean;
  resumeFileName?: string;
}

export async function submitRbtApplication(data: RbtApplicationInput) {
  try {
    if (!data.firstName || !data.lastName || !data.email || !data.phoneNumber) {
      return { success: false, error: 'Missing required personal information.' };
    }

    if (!data.backgroundCheckConsent) {
      return { success: false, error: 'Background check authorization is required.' };
    }

    // Check if user already exists with this email
    let existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (!existingUser) {
      existingUser = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          email: data.email.toLowerCase().trim(),
          firstName: data.firstName,
          lastName: data.lastName,
          role: 'RBT',
          isActive: false,
        },
      });
    }

    revalidatePath('/', 'layout');
    revalidatePath('/portal-hr/ats', 'page');

    return {
      success: true,
      applicantId: existingUser.id,
      message: 'Application submitted successfully!',
    };
  } catch (error: any) {
    console.error('Error submitting RBT application:', error);
    return {
      success: false,
      error: error?.message || 'Failed to submit application. Please try again.',
    };
  }
}
