'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Prisma, Role } from '@repo/db';

import { requireStaff } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { resolveActingRbtContext } from '@/lib/resolveActingRbt';
import { canUseApplicantDeviceSession } from '@/lib/applicantAccessPolicy';
import { isCandidateDeviceSessionCurrent } from '@/lib/candidateDeviceSession';
import { asRecord } from '@/lib/atsStage';

const RBT_STAFF_ROLES = [
  'RBT',
  'HEAD_HR',
  'HR',
  'HR_AGENT',
  'CEO',
  'OPS_DIRECTOR',
] as const satisfies readonly Role[];

const SESSION_COOKIE = 'ras_device_session_token';
const FINGERPRINT_COOKIE = 'device_fingerprint';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/**
 * Records an EVV walkthrough as fictional training only.
 * Does NOT set simulationDone / passed hire evidence or advance ATS stage.
 */
export async function completeRbtSimulation(): Promise<{
  success: boolean;
  code?: string;
  error?: string;
}> {
  try {
    let candidateId: string | null = null;
    const staffGate = await requireStaff(RBT_STAFF_ROLES);
    if (staffGate.ok) {
      if (isUuid(staffGate.user.id)) {
        const ownedCandidate = await prisma.atsCandidate.findFirst({
          where: {
            userId: staffGate.user.id,
            appliedRole: 'RBT',
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (ownedCandidate) {
          candidateId = ownedCandidate.id;
        }
      }
      if (!candidateId) {
        const acting = await resolveActingRbtContext();
        if (acting.candidateId && isUuid(acting.candidateId)) {
          candidateId = acting.candidateId;
        }
      }
    }

    if (!candidateId) {
      const cookieStore = await cookies();
      const sessionCandidateId = cookieStore.get(SESSION_COOKIE)?.value ?? null;
      const fingerprint = cookieStore.get(FINGERPRINT_COOKIE)?.value ?? null;
      if (isUuid(sessionCandidateId) && isUuid(fingerprint)) {
        const applicantSession = await prisma.applicantDeviceSession.findUnique({
          where: {
            candidateId_deviceFingerprint: {
              candidateId: sessionCandidateId,
              deviceFingerprint: fingerprint,
            },
          },
          select: {
            revokedAt: true,
            boundAt: true,
            candidate: {
              select: {
                id: true,
                appliedRole: true,
                stage: true,
                activationStatus: true,
              },
            },
          },
        });
        if (
          applicantSession &&
          isCandidateDeviceSessionCurrent(applicantSession) &&
          applicantSession.candidate.appliedRole === 'RBT' &&
          canUseApplicantDeviceSession(applicantSession.candidate)
        ) {
          candidateId = applicantSession.candidate.id;
        }
      }
    }

    if (!candidateId) {
      const acting = await resolveActingRbtContext();
      if (acting.candidateId && isUuid(acting.candidateId)) {
        candidateId = acting.candidateId;
      }
    }

    if (!candidateId) {
      return {
        success: false,
        code: 'IDENTITY_REQUIRED',
        error: 'Open your applicant magic link on this device to save training progress.',
      };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: {
        onboardingPacket: {
          select: {
            formData: true,
          },
        },
      },
    });

    if (!candidate?.onboardingPacket) {
      return {
        success: false,
        code: 'PROFILE_NOT_FOUND',
        error: 'Your onboarding packet is unavailable. Ask HR to restore your profile.',
      };
    }

    const existingFormData = asRecord(candidate.onboardingPacket.formData);

    await prisma.candidateOnboardingPacket.update({
      where: { candidateId },
      data: {
        formData: {
          ...existingFormData,
          evvWalkthroughAttempt: {
            completed: true,
            fictional: true,
            countsTowardHire: false,
            completedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });

    try {
      revalidatePath('/rbt/simulation');
      revalidatePath('/rbt', 'layout');
    } catch {
      // Ignore revalidate error outside request context
    }

    return { success: true };
  } catch (error) {
    console.error(
      'completeRbtSimulation failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      code: 'SERVER_ERROR',
      error: 'Failed to record simulation walkthrough. Please try again.',
    };
  }
}
