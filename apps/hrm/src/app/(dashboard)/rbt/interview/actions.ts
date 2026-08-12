'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import { newMagicLinkExpiry } from '@/lib/magicLinkExpiry';
import {
  asRecord,
  deriveAtsStage,
  readProgressFromPacket,
} from '@/lib/atsStage';
import { canUseApplicantDeviceSession } from '@/lib/applicantAccessPolicy';
import {
  INTERVIEW_TIME_SLOTS_ET,
  deriveInterviewView,
  normalizeInterviewTimeEt,
  parseInterviewSlotEt,
  type InterviewPortalResult,
  type InterviewPortalSnapshot,
} from './interviewUi';

const SESSION_COOKIE = 'ras_device_session_token';
const FINGERPRINT_COOKIE = 'device_fingerprint';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ApplicantAccess =
  | { ok: true; candidateId: string }
  | {
      ok: false;
      reason: 'NO_SESSION' | 'INACTIVE_SESSION' | 'UNAVAILABLE';
      error: string;
    };

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

async function resolveApplicantAccess(): Promise<ApplicantAccess> {
  try {
    const cookieStore = await cookies();
    const sessionCandidateId = cookieStore.get(SESSION_COOKIE)?.value || null;
    const fingerprint = cookieStore.get(FINGERPRINT_COOKIE)?.value || null;

    if (isUuid(sessionCandidateId)) {
      if (!isUuid(fingerprint)) {
        if (isDevToolsEnabled()) {
          return { ok: true, candidateId: sessionCandidateId };
        }
      } else {
        const session = await prisma.applicantDeviceSession.findUnique({
          where: {
            candidateId_deviceFingerprint: {
              candidateId: sessionCandidateId,
              deviceFingerprint: fingerprint,
            },
          },
          select: {
            revokedAt: true,
            candidate: {
              select: {
                stage: true,
                activationStatus: true,
              },
            },
          },
        });
        if (
          session &&
          !session.revokedAt &&
          canUseApplicantDeviceSession(session.candidate)
        ) {
          return { ok: true, candidateId: sessionCandidateId };
        }
      }
    }

    const user = await getCurrentUser();
    if (user?.role === 'RBT' && isUuid(user.id)) {
      const candidate = await prisma.atsCandidate.findFirst({
        where: { userId: user.id },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (candidate) return { ok: true, candidateId: candidate.id };
    }

    if (isUuid(sessionCandidateId)) {
      return {
        ok: false,
        reason: 'INACTIVE_SESSION',
        error: 'This applicant session is not active on this device.',
      };
    }

    return {
      ok: false,
      reason: 'NO_SESSION',
      error: 'Open your applicant magic link on this device to view the interview workspace.',
    };
  } catch (error) {
    console.error(
      'resolveApplicantAccess failed [rbt interview]:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      ok: false,
      reason: 'UNAVAILABLE',
      error: 'Secure applicant access could not be verified. Please try again.',
    };
  }
}

async function loadSnapshot(candidateId: string): Promise<InterviewPortalResult> {
  const candidate = await prisma.atsCandidate.findUnique({
    where: { id: candidateId },
    select: {
      firstName: true,
      stage: true,
      activationStatus: true,
      dossier: true,
      onboardingPacket: {
        select: {
          interviewBooked: true,
          interviewPassed: true,
        },
      },
      interview: {
        select: {
          id: true,
          status: true,
          recommendation: true,
          interviewerUserId: true,
          scheduledDate: true,
          scheduledTime: true,
          meetingLink: true,
          hrJoinedAt: true,
          completedAt: true,
          interviewer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!candidate) {
    return {
      success: false,
      reason: 'NOT_FOUND',
      error: 'The applicant record linked to this device is no longer available.',
    };
  }

  const flags = readProgressFromPacket(candidate.onboardingPacket, candidate.dossier);
  const interview = candidate.interview
    ? {
        id: candidate.interview.id,
        status: candidate.interview.status,
        recommendation: candidate.interview.recommendation,
        interviewerUserId: candidate.interview.interviewerUserId,
        scheduledDate: candidate.interview.scheduledDate,
        scheduledTime: candidate.interview.scheduledTime,
        meetingLink: candidate.interview.meetingLink,
        hrJoinedAt: candidate.interview.hrJoinedAt?.toISOString() ?? null,
        completedAt: candidate.interview.completedAt?.toISOString() ?? null,
        interviewerName: candidate.interview.interviewer
          ? `${candidate.interview.interviewer.firstName} ${candidate.interview.interviewer.lastName}`.trim()
          : null,
      }
    : null;

  const hrUsers = await prisma.user.findMany({
    where: {
      role: { in: ['HR_AGENT', 'HEAD_HR'] },
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
  });

  const snapshot: InterviewPortalSnapshot = {
    candidate: {
      firstName: candidate.firstName,
      stage: candidate.stage,
      activationStatus: candidate.activationStatus,
    },
    interviewBooked:
      flags.interviewBooked ||
      Boolean(
        interview &&
          ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(interview.status)
      ),
    // Approval comes only from the durable packet flag set by HR evaluation.
    interviewPassed: Boolean(flags.interviewPassed),
    interview,
    hrMembers: hrUsers.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role === 'HEAD_HR' ? 'Head of HR' : 'HR Specialist',
    })),
  };

  return { success: true, data: snapshot };
}

export async function getInterviewPortalSnapshot(): Promise<InterviewPortalResult> {
  const gate = await resolveApplicantAccess();
  if (!gate.ok) {
    return {
      success: false,
      reason: gate.reason,
      error: gate.error,
    };
  }

  try {
    return await loadSnapshot(gate.candidateId);
  } catch (error) {
    console.error(
      'getInterviewPortalSnapshot failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      reason: 'UNAVAILABLE',
      error: 'Interview details are temporarily unavailable. Please try again.',
    };
  }
}

export async function bookOwnInterview(input: {
  interviewerId: string;
  date: string;
  time: string;
}): Promise<
  | { success: true; data: InterviewPortalSnapshot }
  | { success: false; error: string }
> {
  const gate = await resolveApplicantAccess();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const interviewerId = String(input.interviewerId || '');
    const date = String(input.date || '').trim();
    const time = normalizeInterviewTimeEt(String(input.time || ''));
    const scheduledAt = parseInterviewSlotEt(date, time);

    if (!isUuid(interviewerId)) {
      return { success: false, error: 'Choose an available HR specialist.' };
    }
    if (!scheduledAt) {
      return { success: false, error: 'Choose a valid Eastern Time appointment.' };
    }
    if (
      !INTERVIEW_TIME_SLOTS_ET.includes(
        time as (typeof INTERVIEW_TIME_SLOTS_ET)[number]
      )
    ) {
      return { success: false, error: 'Choose one of the available ET time slots.' };
    }
    if (scheduledAt.getTime() <= Date.now()) {
      return { success: false, error: 'Choose a future Eastern Time appointment.' };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: gate.candidateId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        stage: true,
        activationStatus: true,
        dossier: true,
        onboardingPacket: {
          select: {
            tasksDone: true,
            availabilityDone: true,
            simulationDone: true,
            interviewBooked: true,
            interviewPassed: true,
            certUploaded: true,
            backgroundCleared: true,
            clearedForHire: true,
          },
        },
        interview: {
          select: {
            status: true,
            recommendation: true,
            scheduledDate: true,
            scheduledTime: true,
          },
        },
      },
    });
    if (!candidate) {
      return { success: false, error: 'Applicant record not found.' };
    }

    const previousFlags = readProgressFromPacket(
      candidate.onboardingPacket,
      candidate.dossier
    );
    const view = deriveInterviewView({
      stage: candidate.stage,
      activationStatus: candidate.activationStatus,
      interviewBooked: Boolean(previousFlags.interviewBooked),
      interviewPassed: Boolean(previousFlags.interviewPassed),
      interview: candidate.interview,
    });
    if (view !== 'BOOKING' && view !== 'SCHEDULED') {
      return {
        success: false,
        error:
          view === 'LOCKED'
            ? 'Interview scheduling is not available at your current application stage.'
            : 'This interview can no longer be rescheduled from the applicant portal.',
      };
    }

    const interviewer = await prisma.user.findFirst({
      where: {
        id: interviewerId,
        role: { in: ['HR_AGENT', 'HEAD_HR'] },
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!interviewer) {
      return {
        success: false,
        error: 'That HR specialist is no longer available. Choose another specialist.',
      };
    }

    const nextProgress = {
      ...previousFlags,
      interviewBooked: true,
    };
    const nextStage = deriveAtsStage({
      activationStatus: candidate.activationStatus,
      currentStage: candidate.stage,
      progress: nextProgress,
    });
    const meetingCode = `RiseAndShine_HR_Interview_${candidate.id}`;
    const meetingLink = `https://meet.jit.si/${meetingCode}`;

    await prisma.$transaction([
      prisma.atsInterview.upsert({
        where: { candidateId: candidate.id },
        create: {
          candidateId: candidate.id,
          interviewerUserId: interviewer.id,
          scheduledDate: date,
          scheduledTime: time,
          scheduledAt,
          meetingCode,
          meetingLink,
          status: 'SCHEDULED',
        },
        update: {
          interviewerUserId: interviewer.id,
          scheduledDate: date,
          scheduledTime: time,
          scheduledAt,
          meetingCode,
          meetingLink,
          status: 'SCHEDULED',
          hrJoinedAt: null,
          completedAt: null,
          recommendation: null,
        },
      }),
      prisma.atsCandidate.update({
        where: { id: candidate.id },
        data: {
          stage: nextStage,
          dossier: {
            ...asRecord(candidate.dossier),
            progress: nextProgress,
          },
          onboardingPacket: {
            upsert: {
              create: {
                magicLinkToken: crypto.randomUUID(),
                magicLinkExpiresAt: newMagicLinkExpiry(),
                formData: {},
                interviewBooked: true,
              },
              update: {
                interviewBooked: true,
              },
            },
          },
        },
      }),
    ]);

    try {
      await prisma.notification.create({
        data: {
          userId: interviewer.id,
          title: 'New RBT Onboarding Interview Scheduled',
          message: `${candidate.firstName} ${candidate.lastName} scheduled an onboarding interview for ${date} at ${time}.`,
          type: 'INFO',
          linkUrl: `/ats/applicant/${candidate.id}`,
        },
      });
    } catch (error) {
      console.error(
        'bookOwnInterview notification failed:',
        error instanceof Error ? error.message : 'Unknown'
      );
    }

    revalidatePath('/rbt/interview');
    revalidatePath('/rbt');
    revalidatePath('/ats');
    revalidatePath(`/ats/applicant/${candidate.id}`);

    const refreshed = await loadSnapshot(candidate.id);
    if (!refreshed.success) {
      return {
        success: false,
        error: 'Interview booked, but the updated details could not be loaded.',
      };
    }
    return { success: true, data: refreshed.data };
  } catch (error) {
    console.error(
      'bookOwnInterview failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: 'The interview could not be scheduled. Please try again.',
    };
  }
}
