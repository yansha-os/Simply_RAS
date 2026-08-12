'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Prisma, Role } from '@repo/db';

import { requireStaff } from '@/lib/auth-guard';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import { prisma } from '@/lib/prisma';
import { resolveActingRbtContext } from '@/lib/resolveActingRbt';
import { canUseApplicantDeviceSession } from '@/lib/applicantAccessPolicy';
import {
  asRecord,
  deriveAtsStage,
  readProgressFromPacket,
} from '@/lib/atsStage';
import {
  createAvailabilitySnapshot,
  validateAvailabilitySubmission,
  type AvailabilityResult,
  type AvailabilitySubmission,
  type SaveAvailabilityResult,
} from './availabilityModel';

const RBT_ROLES = ['RBT'] as const satisfies readonly Role[];
const SESSION_COOKIE = 'ras_device_session_token';
const FINGERPRINT_COOKIE = 'device_fingerprint';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVAILABILITY_PACKET_SELECT = {
  availabilityDone: true,
  availabilityGrid: true,
  preferredBoroughs: true,
  transportation: true,
  maxTravelMiles: true,
  updatedAt: true,
} as const;

const PROGRESS_PACKET_SELECT = {
  ...AVAILABILITY_PACKET_SELECT,
  tasksDone: true,
  simulationDone: true,
  interviewBooked: true,
  interviewPassed: true,
  certUploaded: true,
  backgroundCleared: true,
  clearedForHire: true,
} as const;

type AvailabilityActorGate =
  | { ok: true; candidateId: string }
  | {
      ok: false;
      error: string;
      code: 'IDENTITY_REQUIRED' | 'PROFILE_NOT_FOUND' | 'FORBIDDEN';
    };

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/**
 * Resolve the candidate whose availability the caller owns.
 *
 * Real RBT auth is linked by User.id. Applicant access requires the durable
 * candidate + device-fingerprint session row; a candidate-id cookie alone is
 * never authorization. Dev mock resolution is allowed only behind the central
 * dev-tools gate.
 */
async function requireAvailabilityActor(): Promise<AvailabilityActorGate> {
  try {
    const staffGate = await requireStaff(RBT_ROLES);
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
        if (!ownedCandidate) {
          return {
            ok: false,
            code: 'PROFILE_NOT_FOUND',
            error: 'Your RBT account is not linked to an ATS availability profile.',
          };
        }
        return { ok: true, candidateId: ownedCandidate.id };
      }

      if (!isDevToolsEnabled()) {
        return {
          ok: false,
          code: 'FORBIDDEN',
          error: 'A verified RBT account is required to manage availability.',
        };
      }

      const acting = await resolveActingRbtContext();
      if (!acting.candidateId || !acting.rbtUserId) {
        return {
          ok: false,
          code: 'PROFILE_NOT_FOUND',
          error: 'The active demo RBT has no linked ATS availability profile.',
        };
      }

      const demoCandidate = await prisma.atsCandidate.findFirst({
        where: {
          id: acting.candidateId,
          userId: acting.rbtUserId,
          appliedRole: 'RBT',
        },
        select: { id: true },
      });
      if (!demoCandidate) {
        return {
          ok: false,
          code: 'PROFILE_NOT_FOUND',
          error: 'The active demo RBT has no linked ATS availability profile.',
        };
      }
      return { ok: true, candidateId: demoCandidate.id };
    }

    const cookieStore = await cookies();
    const candidateId = cookieStore.get(SESSION_COOKIE)?.value ?? null;
    const fingerprint = cookieStore.get(FINGERPRINT_COOKIE)?.value ?? null;
    if (!isUuid(candidateId) || !isUuid(fingerprint)) {
      return {
        ok: false,
        code: 'IDENTITY_REQUIRED',
        error: 'Open your applicant magic link on this device to manage availability.',
      };
    }

    const applicantSession = await prisma.applicantDeviceSession.findUnique({
      where: {
        candidateId_deviceFingerprint: {
          candidateId,
          deviceFingerprint: fingerprint,
        },
      },
      select: {
        revokedAt: true,
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
      !applicantSession ||
      applicantSession.revokedAt ||
      applicantSession.candidate.appliedRole !== 'RBT' ||
      !canUseApplicantDeviceSession(applicantSession.candidate)
    ) {
      return {
        ok: false,
        code: 'IDENTITY_REQUIRED',
        error: 'This applicant session is no longer active. Open your magic link again.',
      };
    }

    return { ok: true, candidateId: applicantSession.candidate.id };
  } catch (error) {
    console.error(
      'Availability actor gate failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      ok: false,
      code: 'IDENTITY_REQUIRED',
      error: 'We could not verify your RBT profile. Please try again.',
    };
  }
}

export async function getMyRbtAvailability(): Promise<AvailabilityResult> {
  const gate = await requireAvailabilityActor();
  if (!gate.ok) {
    return { success: false, code: gate.code, error: gate.error };
  }

  try {
    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: gate.candidateId },
      select: {
        stage: true,
        onboardingPacket: { select: AVAILABILITY_PACKET_SELECT },
      },
    });
    if (!candidate) {
      return {
        success: false,
        code: 'PROFILE_NOT_FOUND',
        error: 'Your ATS availability profile could not be found.',
      };
    }

    return {
      success: true,
      data: createAvailabilitySnapshot({
        stage: candidate.stage,
        packet: candidate.onboardingPacket,
      }),
    };
  } catch (error) {
    console.error(
      'Availability load failed [getMyRbtAvailability]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      code: 'LOAD_FAILED',
      error: 'Availability could not be loaded. Please try again.',
    };
  }
}

export async function saveMyRbtAvailability(
  input: AvailabilitySubmission
): Promise<SaveAvailabilityResult> {
  const gate = await requireAvailabilityActor();
  if (!gate.ok) {
    return { success: false, code: gate.code, error: gate.error };
  }

  const validated = validateAvailabilitySubmission(input);
  if (!validated.ok) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: validated.error,
    };
  }

  try {
    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: gate.candidateId },
      select: {
        stage: true,
        activationStatus: true,
        dossier: true,
        onboardingPacket: { select: PROGRESS_PACKET_SELECT },
      },
    });
    if (!candidate?.onboardingPacket) {
      return {
        success: false,
        code: 'PROFILE_NOT_FOUND',
        error: 'Your onboarding packet is unavailable. Ask HR to restore your profile.',
      };
    }
    if (candidate.stage === 'REJECTED' || candidate.activationStatus === 'REJECTED') {
      return {
        success: false,
        code: 'FORBIDDEN',
        error: 'This application is closed, so availability can no longer be changed.',
      };
    }

    const previousProgress = readProgressFromPacket(
      candidate.onboardingPacket,
      candidate.dossier
    );
    const nextProgress = {
      ...previousProgress,
      availabilityDone: true,
    };
    const nextStage = deriveAtsStage({
      activationStatus: candidate.activationStatus,
      currentStage: candidate.stage,
      progress: nextProgress,
    });
    const dossier = asRecord(candidate.dossier);

    const updated = await prisma.atsCandidate.update({
      where: { id: gate.candidateId },
      data: {
        stage: nextStage,
        dossier: {
          ...dossier,
          progress: nextProgress,
        } as Prisma.InputJsonValue,
        onboardingPacket: {
          update: {
            availabilityDone: true,
            availabilityGrid: validated.value.availability as Prisma.InputJsonValue,
            preferredBoroughs: validated.value.preferredBoroughs,
            transportation: validated.value.transportation,
            maxTravelMiles: validated.value.maxTravelMiles,
          },
        },
      },
      select: {
        stage: true,
        onboardingPacket: { select: AVAILABILITY_PACKET_SELECT },
      },
    });

    try {
      revalidatePath('/rbt/availability');
      revalidatePath('/rbt', 'layout');
      revalidatePath('/ats');
    } catch (error) {
      // The database write is already confirmed. Cache invalidation must not
      // turn a successful persisted save into a false failure in the client.
      console.error(
        'Availability revalidation failed [saveMyRbtAvailability]:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return {
      success: true,
      data: createAvailabilitySnapshot({
        stage: updated.stage,
        packet: updated.onboardingPacket,
      }),
    };
  } catch (error) {
    console.error(
      'Availability save failed [saveMyRbtAvailability]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      code: 'SAVE_FAILED',
      error: 'Availability could not be saved. Reload to confirm the current database version.',
    };
  }
}
