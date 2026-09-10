'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { requireRole, requireStaff } from '@/lib/auth-guard';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import { newMagicLinkExpiry } from '@/lib/magicLinkExpiry';
import {
  CANDIDATE_SESSION_COOKIE,
  DEVICE_FINGERPRINT_COOKIE,
  resolveFingerprintValidCandidate,
} from '@/lib/candidateDeviceSession';
import type { Role, Prisma } from '@repo/db';
import {
  asRecord,
  deriveAtsStage,
  readProgressFromPacket,
} from '@/lib/atsStage';

const ATS_STAFF_ROLES = [
  'HEAD_HR',
  'HR',
  'HR_AGENT',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const INTERVIEW_RELEASE_ROLES = [
  'HEAD_HR',
  'HR',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INTERVIEW_SCORECARD_KEYS = [
  'communication', 'adaptability', 'professionalism', 'empathy',
  'abaBasics', 'documentation', 'reliability', 'availabilityFit',
] as const;

type InterviewScorecard = Record<
  (typeof INTERVIEW_SCORECARD_KEYS)[number],
  { score: number | null; comment: string }
>;

function validateInterviewScorecard(value: unknown): InterviewScorecard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== INTERVIEW_SCORECARD_KEYS.length ||
    !INTERVIEW_SCORECARD_KEYS.every((key) => Object.hasOwn(input, key))
  ) return null;

  const validated: Partial<InterviewScorecard> = {};
  for (const key of INTERVIEW_SCORECARD_KEYS) {
    const category = input[key];
    if (!category || typeof category !== 'object' || Array.isArray(category)) return null;
    const fields = category as Record<string, unknown>;
    const { score, comment } = fields;
    if (
      !(score === null || (typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5)) ||
      typeof comment !== 'string' || comment.length > 1_000
    ) return null;
    validated[key] = { score, comment: comment.trim() };
  }

  return validated as InterviewScorecard;
}

export interface HrMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

export type AtsInterviewDto = {
  id: string;
  candidateId: string;
  interviewerUserId: string | null;
  interviewerName: string | null;
  claimedByUserId: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  scheduledAt: string | null;
  meetingCode: string | null;
  meetingLink: string | null;
  status: string;
  hrJoinedAt: string | null;
  scorecard: Record<string, unknown>;
  interviewerNotes: string | null;
  scriptProgress: Record<string, unknown>;
  completedScriptSteps: number[];
  recommendation: string | null;
  completedAt: string | null;
};

export type ApplicantInterviewBookingDto = Pick<
  AtsInterviewDto,
  | 'id'
  | 'candidateId'
  | 'interviewerUserId'
  | 'interviewerName'
  | 'scheduledDate'
  | 'scheduledTime'
  | 'scheduledAt'
  | 'meetingCode'
  | 'meetingLink'
  | 'status'
>;

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

async function requireInterviewAccess(candidateId: string) {
  const user = await getCurrentUser();
  if (user && user.isActive !== false && ATS_STAFF_ROLES.includes(user.role as Role)) {
    return { ok: true as const, actor: 'STAFF' as const };
  }

  const cookieStore = await cookies();
  const candidate = await resolveFingerprintValidCandidate(
    cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
    cookieStore.get(DEVICE_FINGERPRINT_COOKIE)?.value
  );
  if (candidate?.id === candidateId) {
    return { ok: true as const, actor: 'CANDIDATE' as const };
  }

  return {
    ok: false as const,
    error: 'You are not authorized to access this interview.',
  };
}

async function requireInterviewDirectoryAccess() {
  const user = await getCurrentUser();
  if (user && user.isActive !== false && ATS_STAFF_ROLES.includes(user.role as Role)) {
    return { ok: true as const };
  }

  const cookieStore = await cookies();
  const candidate = await resolveFingerprintValidCandidate(
    cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
    cookieStore.get(DEVICE_FINGERPRINT_COOKIE)?.value
  );
  return candidate
    ? { ok: true as const }
    : { ok: false as const, error: 'You are not authorized to view interview staff.' };
}

function toInterviewDto(row: {
  id: string;
  candidateId: string;
  interviewerUserId: string | null;
  claimedByUserId: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  scheduledAt: Date | null;
  meetingCode: string | null;
  meetingLink: string | null;
  status: string;
  hrJoinedAt: Date | null;
  scorecard: unknown;
  interviewerNotes: string | null;
  scriptProgress: unknown;
  recommendation: string | null;
  completedAt: Date | null;
  interviewer?: { firstName: string; lastName: string; role: string } | null;
}): AtsInterviewDto {
  const script = asRecord(row.scriptProgress);
  const completedSteps = Array.isArray(script.completedSteps)
    ? script.completedSteps.filter((n): n is number => typeof n === 'number')
    : Array.isArray(row.scriptProgress)
      ? (row.scriptProgress as unknown[]).filter((n): n is number => typeof n === 'number')
      : [];

  return {
    id: row.id,
    candidateId: row.candidateId,
    interviewerUserId: row.interviewerUserId,
    interviewerName: row.interviewer
      ? `${row.interviewer.firstName} ${row.interviewer.lastName}`
      : null,
    claimedByUserId: row.claimedByUserId,
    scheduledDate: row.scheduledDate,
    scheduledTime: row.scheduledTime,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    meetingCode: row.meetingCode,
    meetingLink: row.meetingLink,
    status: row.status,
    hrJoinedAt: row.hrJoinedAt?.toISOString() ?? null,
    scorecard: asRecord(row.scorecard),
    interviewerNotes: row.interviewerNotes,
    scriptProgress: script,
    completedScriptSteps: completedSteps,
    recommendation: row.recommendation,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toApplicantBookingDto(
  row: Parameters<typeof toInterviewDto>[0]
): ApplicantInterviewBookingDto {
  const internal = toInterviewDto(row);
  return {
    id: internal.id,
    candidateId: internal.candidateId,
    interviewerUserId: internal.interviewerUserId,
    interviewerName: internal.interviewerName,
    scheduledDate: internal.scheduledDate,
    scheduledTime: internal.scheduledTime,
    scheduledAt: internal.scheduledAt,
    meetingCode: internal.meetingCode,
    meetingLink: internal.meetingLink,
    status: internal.status,
  };
}

async function markInterviewBookedProgress(candidateId: string) {
  const candidate = await prisma.atsCandidate.findUnique({
    where: { id: candidateId },
    include: {
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
    },
  });
  if (!candidate) return;

  const progress = {
    ...readProgressFromPacket(candidate.onboardingPacket, candidate.dossier),
    interviewBooked: true,
  };
  const nextStage = deriveAtsStage({
    activationStatus: candidate.activationStatus,
    currentStage: candidate.stage,
    progress,
  });

  await prisma.atsCandidate.update({
    where: { id: candidateId },
    data: {
      stage: nextStage,
      dossier: {
        ...asRecord(candidate.dossier),
        progress,
      },
      onboardingPacket: {
        upsert: {
          create: {
            magicLinkToken: crypto.randomUUID(),
            magicLinkExpiresAt: newMagicLinkExpiry(),
            formData: {},
            interviewBooked: true,
          },
          update: { interviewBooked: true },
        },
      },
    },
  });
}

export async function getHrMembers(): Promise<{
  success: boolean;
  data: HrMember[];
  error?: string;
}> {
  try {
    const access = await requireInterviewDirectoryAccess();
    if (!access.ok) {
      return { success: false, data: [], error: access.error };
    }

    // Bookable interviewers: active HR agents first (Marcus Vance), then Head HR.
    // Do not invent fake demo names — only real User rows.
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
        email: true,
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });

    // Prefer HR_AGENT before HEAD_HR in the picker
    const sorted = [...hrUsers].sort((a, b) => {
      if (a.role === 'HR_AGENT' && b.role !== 'HR_AGENT') return -1;
      if (b.role === 'HR_AGENT' && a.role !== 'HR_AGENT') return 1;
      return a.firstName.localeCompare(b.firstName);
    });

    const formattedHrMembers: HrMember[] = sorted.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role === 'HEAD_HR' ? 'Head of HR' : 'HR Agent',
      email: u.email,
    }));

    return { success: true, data: formattedHrMembers };
  } catch (error: unknown) {
    console.error(
      'Error fetching HR members [getHrMembers]:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      data: [],
      error: 'Failed to load HR specialists.',
    };
  }
}

export async function bookHrInterview(data: {
  candidateId: string;
  candidateName: string;
  hrInterviewerId: string;
  hrInterviewerName: string;
  date: string;
  time: string;
}) {
  try {
    if (!data.candidateId || !isUuid(data.candidateId)) {
      return { success: false, error: 'A valid candidate id is required to book.' };
    }
    const access = await requireInterviewAccess(data.candidateId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }
    if (!data.date || !data.time) {
      return { success: false, error: 'Missing required interview parameters.' };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: data.candidateId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!candidate) {
      return { success: false, error: 'Candidate not found.' };
    }

    const interviewer = isUuid(data.hrInterviewerId)
      ? await prisma.user.findFirst({
          where: {
            id: data.hrInterviewerId,
            role: { in: ['HR_AGENT', 'HEAD_HR'] },
            isActive: true,
          },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;
    if (!interviewer) {
      return { success: false, error: 'Select an active HR interviewer.' };
    }

    const roomName = `RiseAndShine_HR_Interview_${data.candidateId}`;
    const meetingLink = `https://meet.jit.si/${roomName}`;
    const interviewerUserId = interviewer.id;
    const interviewerName = `${interviewer.firstName} ${interviewer.lastName}`.trim();

    const interview = await prisma.atsInterview.upsert({
      where: { candidateId: data.candidateId },
      create: {
        candidateId: data.candidateId,
        interviewerUserId,
        scheduledDate: data.date,
        scheduledTime: data.time,
        scheduledAt: new Date(),
        meetingCode: roomName,
        meetingLink,
        status: 'SCHEDULED',
      },
      update: {
        interviewerUserId,
        scheduledDate: data.date,
        scheduledTime: data.time,
        scheduledAt: new Date(),
        meetingCode: roomName,
        meetingLink,
        status: 'SCHEDULED',
        hrJoinedAt: null,
        completedAt: null,
        recommendation: null,
      },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    await markInterviewBookedProgress(data.candidateId);

    if (interviewerUserId) {
      try {
        await prisma.notification.create({
          data: {
            userId: interviewerUserId,
            title: 'New RBT Onboarding Interview Scheduled',
            message: `${data.candidateName} scheduled an onboarding interview with you for ${data.date} at ${data.time}.`,
            type: 'INFO',
            linkUrl: `/ats/applicant/${data.candidateId}`,
          },
        });
      } catch (notifyErr) {
        console.error(
          'bookHrInterview notify failed:',
          notifyErr instanceof Error ? notifyErr.message : 'Unknown'
        );
      }
    }

    revalidatePath('/rbt/interview');
    revalidatePath('/ats');
    revalidatePath(`/ats/applicant/${data.candidateId}`);

    return {
      success: true,
      message: `Interview successfully booked with ${interviewerName}!`,
      interview: toApplicantBookingDto(interview),
    };
  } catch (error: unknown) {
    console.error(
      'Error booking HR interview [bookHrInterview]:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record interview booking.',
    };
  }
}

export async function getAtsInterview(candidateId: string): Promise<{
  success: boolean;
  data?: AtsInterviewDto | null;
  error?: string;
}> {
  try {
    if (!isUuid(candidateId)) {
      return { success: true, data: null };
    }
    const access = await requireInterviewAccess(candidateId);
    if (!access.ok || access.actor !== 'STAFF') {
      return {
        success: false,
        error: access.ok
          ? 'You are not authorized to view internal interview records.'
          : access.error,
      };
    }

    const row = await prisma.atsInterview.findUnique({
      where: { candidateId },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    return { success: true, data: row ? toInterviewDto(row) : null };
  } catch (error: unknown) {
    console.error(
      'getAtsInterview failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load interview.',
    };
  }
}

export async function claimAtsInterview(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);
    let user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'UNAUTHORIZED: Authentication required.' };
    }

    // Dev Tools role-only impersonation uses mock-user-id — map to real HR_AGENT (Marcus)
    if (user.id === 'mock-user-id' || !isUuid(user.id)) {
      // Production must never attribute a claim to a real agent from a mock identity.
      if (!isDevToolsEnabled()) {
        return { success: false, error: 'UNAUTHORIZED: Authentication required.' };
      }
      const agent = await prisma.user.findFirst({
        where: { role: 'HR_AGENT', isActive: true },
        orderBy: { firstName: 'asc' },
      });
      if (!agent) {
        return { success: false, error: 'No active HR agent user found to claim interviews.' };
      }
      user = agent;
    }

    const updated = await prisma.atsInterview.update({
      where: { candidateId },
      data: {
        claimedByUserId: user.id,
        interviewerUserId: user.id,
        status: 'IN_PROGRESS',
      },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);
    revalidatePath('/ats');

    return { success: true, interview: toInterviewDto(updated) };
  } catch (error: unknown) {
    console.error(
      'claimAtsInterview failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim interview.',
    };
  }
}

/** Leadership: release an unstarted interview claim back to the HR queue. */
export async function releaseAtsInterviewClaim(candidateId: string) {
  const gate = await requireStaff(INTERVIEW_RELEASE_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const released = await prisma.atsInterview.updateMany({
      where: {
        candidateId,
        claimedByUserId: { not: null },
        hrJoinedAt: null,
        completedAt: null,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      data: {
        claimedByUserId: null,
        status: 'SCHEDULED',
      },
    });
    if (released.count !== 1) {
      return {
        success: false,
        error: 'This interview is unclaimed, already joined, or already completed. Reload before retrying.',
      };
    }

    revalidatePath(`/ats/applicant/${candidateId}`);
    revalidatePath('/ats');
    return { success: true };
  } catch (error: unknown) {
    console.error(
      'releaseAtsInterviewClaim failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to release the interview claim.' };
  }
}

export async function markHrJoinedInterview(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const updated = await prisma.atsInterview.update({
      where: { candidateId },
      data: {
        hrJoinedAt: new Date(),
        status: 'IN_PROGRESS',
      },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);
    revalidatePath('/rbt/interview');

    return { success: true, interview: toInterviewDto(updated) };
  } catch (error: unknown) {
    console.error(
      'markHrJoinedInterview failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark HR joined.',
    };
  }
}

export async function saveInterviewNotes(candidateId: string, notes: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const updated = await prisma.atsInterview.upsert({
      where: { candidateId },
      create: {
        candidateId,
        interviewerNotes: notes,
        status: 'SCHEDULED',
      },
      update: { interviewerNotes: notes },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);
    return { success: true, interview: toInterviewDto(updated) };
  } catch (error: unknown) {
    console.error(
      'saveInterviewNotes failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save notes.',
    };
  }
}

export async function saveInterviewScorecard(
  candidateId: string,
  scorecard: unknown
) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };
  if (!isUuid(candidateId)) return { success: false, error: 'Invalid candidate ID.' };

  const validatedScorecard = validateInterviewScorecard(scorecard);
  if (!validatedScorecard) return { success: false, error: 'Scorecard data is invalid.' };

  try {
    const scorecardJson = validatedScorecard as Prisma.InputJsonValue;

    const updated = await prisma.atsInterview.upsert({
      where: { candidateId },
      create: {
        candidateId,
        scorecard: scorecardJson,
        status: 'SCHEDULED',
      },
      update: { scorecard: scorecardJson },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);
    return { success: true, interview: toInterviewDto(updated) };
  } catch (error: unknown) {
    console.error(
      'saveInterviewScorecard failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save scorecard.',
    };
  }
}

export async function saveInterviewScriptProgress(
  candidateId: string,
  completedSteps: unknown
) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };
  if (!isUuid(candidateId)) return { success: false, error: 'Invalid candidate ID.' };
  if (
    !Array.isArray(completedSteps) ||
    completedSteps.length > 11 ||
    completedSteps.some(
      (step) => typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > 10
    ) ||
    new Set(completedSteps).size !== completedSteps.length
  ) {
    return { success: false, error: 'Interview script progress is invalid.' };
  }

  const normalizedSteps = [...completedSteps].sort((left, right) => left - right);

  try {
    const scriptProgress = { completedSteps: normalizedSteps };
    const updated = await prisma.atsInterview.upsert({
      where: { candidateId },
      create: {
        candidateId,
        scriptProgress,
        status: 'SCHEDULED',
      },
      update: { scriptProgress },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);
    return { success: true, interview: toInterviewDto(updated) };
  } catch (error: unknown) {
    console.error(
      'saveInterviewScriptProgress failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save script progress.',
    };
  }
}

export async function completeAtsInterview(
  candidateId: string,
  input: { recommendation?: string; interviewPassed?: boolean } = {}
) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const interviewPassed = input.interviewPassed !== false;
    const recommendation = input.recommendation || (interviewPassed ? 'ADVANCE' : 'REJECT');

    const updated = await prisma.atsInterview.upsert({
      where: { candidateId },
      create: {
        candidateId,
        status: 'COMPLETED',
        recommendation,
        completedAt: new Date(),
      },
      update: {
        status: 'COMPLETED',
        recommendation,
        completedAt: new Date(),
      },
      include: {
        interviewer: { select: { firstName: true, lastName: true, role: true } },
      },
    });

    // Refresh packet flags and stage from the completed AtsInterview evidence.
    const { updateCandidateProgress } = await import('@/app/actions/atsActions');
    await updateCandidateProgress(candidateId, {});

    revalidatePath(`/ats/applicant/${candidateId}`);
    revalidatePath('/ats');
    revalidatePath('/rbt/interview');

    return { success: true, interview: toInterviewDto(updated) };
  } catch (error: unknown) {
    console.error(
      'completeAtsInterview failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete interview.',
    };
  }
}
