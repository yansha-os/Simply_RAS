'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { newMagicLinkExpiry } from '@/lib/magicLinkExpiry';

function normalizeApplyZip(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const zip = String(raw).replace(/\D/g, '').slice(0, 5);
  return zip.length === 5 ? zip : null;
}

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
  gender?: string;
  /** 40-hour course status answer */
  rbtStatus: string;
  bacbNumber?: string;
  cprStatus?: string;
  yearsExperience?: string;
  languages?: string[];
  preferredBoroughs: string[];
  /** Weekday/weekend day names */
  availabilityHours: string[];
  weeklyHours?: string;
  availableToStart?: string;
  transportation?: string;
  workAuth?: string;
  additionalNotes?: string;
  isAdult: boolean;
  backgroundCheckConsent: boolean;
  resumeFileName?: string;
  govtIdFileName?: string;
  /** Optional — if provided at apply, packet certUploaded is set after file attach. */
  fortyHourCertFileName?: string;
}

/** Apply creates AtsCandidate only — RBT User is created at hire in HRM. */
export async function submitRbtApplication(data: RbtApplicationInput) {
  try {
    if (!data.firstName || !data.lastName || !data.email || !data.phoneNumber) {
      return { success: false, error: 'Missing required personal information.' };
    }

    if (!data.backgroundCheckConsent) {
      return { success: false, error: 'Background check authorization is required.' };
    }

    if (!data.isAdult) {
      return { success: false, error: 'You must confirm you are 18 or older to apply.' };
    }

    if (data.workAuth === 'No') {
      return {
        success: false,
        error: 'US work authorization is required for this role.',
      };
    }

    const email = data.email.toLowerCase().trim();
    const transportation = (data.transportation || '').trim();
    const hasTransportation =
      transportation.length > 0 && !transportation.toLowerCase().startsWith('no');

    const dossier = {
      phoneNumber: data.phoneNumber,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      city: data.city || null,
      state: data.state || null,
      zipCode: data.zipCode,
      gender: data.gender || null,
      rbtStatus: data.rbtStatus,
      bacbNumber: data.bacbNumber || null,
      cprStatus: data.cprStatus || null,
      yearsExperience: data.yearsExperience || null,
      languages: Array.isArray(data.languages) ? data.languages : [],
      preferredBoroughs: Array.isArray(data.preferredBoroughs) ? data.preferredBoroughs : [],
      availabilityHours: Array.isArray(data.availabilityHours) ? data.availabilityHours : [],
      weeklyHours: data.weeklyHours || null,
      availableToStart: data.availableToStart || null,
      transportation: transportation || null,
      workAuth: data.workAuth || null,
      additionalNotes: data.additionalNotes?.trim() || null,
      isAdult: data.isAdult,
      backgroundCheckConsent: data.backgroundCheckConsent,
      hasTransportation,
      resumeFileName: data.resumeFileName || null,
      govtIdFileName: data.govtIdFileName || null,
      fortyHourCertFileName: data.fortyHourCertFileName || null,
      submittedAt: new Date().toISOString(),
    };

    const existing = await prisma.atsCandidate.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return {
        success: true,
        message:
          'Application received. If you have already applied, use your existing secure link or contact HR for assistance.',
      };
    }

    const uploadToken = crypto.randomUUID();
    const created = await prisma.atsCandidate.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email,
        phone: data.phoneNumber,
        appliedRole: 'RBT',
        stage: 'APPLIED',
        activationStatus: 'PENDING_HR_REVIEW',
        bacbNumber: data.bacbNumber || null,
        dossier,
        onboardingPacket: {
          create: {
            magicLinkToken: uploadToken,
            magicLinkExpiresAt: newMagicLinkExpiry(),
            formData: dossier,
            resumeFileName: data.resumeFileName || null,
            govtIdFileName: data.govtIdFileName || null,
            preferredBoroughs: dossier.preferredBoroughs,
            transportation: transportation || null,
            homeZipCode: normalizeApplyZip(data.zipCode),
          },
        },
      },
    });

    revalidatePath('/ats');
    
    return {
      success: true,
      applicantId: created.id,
      uploadToken,
      message: 'Application submitted successfully!',
    };
  } catch (error: unknown) {
    console.error(
      'Error submitting RBT application:',
      error instanceof Error ? error.message : error
    );
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to submit application. Please try again.',
    };
  }
}
