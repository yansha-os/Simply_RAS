'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { HR_ROLES, requireRole, requireStaff } from '@/lib/auth-guard';
import { getCurrentUser } from '@/lib/auth';
import { newMagicLinkExpiry } from '@/lib/magicLinkExpiry';
import { resolveActingRbtContext } from '@/lib/resolveActingRbt';
import {
  formatManagerEtDate,
  formatManagerEtTimestamp,
  getRbtManagerWeekWindow,
  summarizeRbtManagerWork,
  type RbtManagerStaffWorkMetrics,
} from '@/lib/rbtManagerMetrics';
import { startOfClinicDay } from '@/lib/clinicTimezone';
import type { Role } from '@repo/db';
import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';
import {
  isOnboardingCompletionEvent,
  ONBOARDING_COMPLETION_ACTIONS,
  ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboardingDocuments';
import {
  NYC_BOROUGHS,
  TRANSPORT_MODES,
  validateAvailabilitySubmission,
} from '@/app/(dashboard)/rbt/availability/availabilityModel';
import {
  asRecord,
  deriveAtsStage,
  readProgressFromPacket,
  snapshotFromPacket,
  type AtsActivationStatus,
  type AtsCandidateData,
  type AtsStage,
  type OnboardingProgressPatch,
  type OnboardingProgressSnapshot,
} from '@/lib/atsStage';
import { hireCandidateDomain } from '@/lib/hiringDomain';

const PACKET_PROGRESS_SELECT = {
  magicLinkToken: true,
  ls54Status: true,
  tasksDone: true,
  tasksCompletedSteps: true,
  availabilityDone: true,
  availabilityGrid: true,
  preferredBoroughs: true,
  transportation: true,
  maxTravelMiles: true,
  simulationDone: true,
  interviewBooked: true,
  interviewPassed: true,
  certUploaded: true,
  backgroundCleared: true,
  clearedForHire: true,
  formData: true,
} as const;

const ATS_STAFF_ROLES = [
  'HEAD_HR',
  'HR',
  'HR_AGENT',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const ATS_HIRING_ROLES = [
  'HEAD_HR',
  'HR',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const STAGE_ORDER: AtsStage[] = [
  'APPLIED',
  'PHONE_SCREEN',
  'INTERVIEW',
  'OFFER',
  'HIRED',
];
const ATS_STAGE_VALUES = new Set<AtsStage>([
  ...STAGE_ORDER,
  'HELP_DESK',
  'REJECTED',
]);
const ATS_ACTIVATION_VALUES = new Set<AtsActivationStatus>([
  'PENDING_HR_REVIEW',
  'INVITATION_SENT',
  'ACTIVE',
  'REJECTED',
]);

const APPLICANT_PROGRESS_KEYS = new Set([
  'availabilityGrid',
  'preferredBoroughs',
  'transportation',
  'maxTravelMiles',
]);
const STAFF_PROGRESS_KEYS = new Set([
  ...APPLICANT_PROGRESS_KEYS,
  'backgroundCleared',
]);
type ValidatedProgressPatch = Pick<
  OnboardingProgressPatch,
  | 'availabilityGrid'
  | 'preferredBoroughs'
  | 'transportation'
  | 'maxTravelMiles'
  | 'backgroundCleared'
>;

function invalidProgressUpdate() {
  return {
    success: false as const,
    code: 'INVALID_PROGRESS_UPDATE' as const,
    error: 'This progress update is not allowed.',
  };
}

async function authorizeCandidateProgress(candidateId: string): Promise<
  | { ok: true; isStaff: boolean }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  const isStaff = Boolean(
    user &&
      user.isActive !== false &&
      ATS_STAFF_ROLES.includes(user.role as Role)
  );
  if (isStaff) return { ok: true, isStaff: true };

  const context = await resolveActingRbtContext();
  if (context.candidateId === candidateId) {
    return { ok: true, isStaff: false };
  }
  return {
    ok: false,
    error: user
      ? 'FORBIDDEN: Not your applicant record.'
      : 'UNAUTHORIZED: Authentication or an active applicant session is required.',
  };
}

function validateProgressPatch(
  patch: unknown,
  isStaff: boolean
):
  | { ok: true; value: ValidatedProgressPatch; keys: string[] }
  | { ok: false } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false };
  }

  const record = patch as Record<string, unknown>;
  const keys = Object.keys(record);
  const allowedKeys = isStaff ? STAFF_PROGRESS_KEYS : APPLICANT_PROGRESS_KEYS;
  if (keys.some((key) => !allowedKeys.has(key))) {
    return { ok: false };
  }

  if (
    Object.prototype.hasOwnProperty.call(record, 'availabilityGrid') &&
    record.availabilityGrid === undefined
  ) {
    return { ok: false };
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'preferredBoroughs') &&
    (!Array.isArray(record.preferredBoroughs) ||
      record.preferredBoroughs.length > NYC_BOROUGHS.length ||
      !record.preferredBoroughs.every(
        (value) =>
          typeof value === 'string' &&
          NYC_BOROUGHS.some((borough) => borough === value)
      ))
  ) {
    return { ok: false };
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'transportation') &&
    (typeof record.transportation !== 'string' ||
      !TRANSPORT_MODES.some(
        (transportation) => transportation === record.transportation
      ))
  ) {
    return { ok: false };
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'maxTravelMiles') &&
    (!Number.isInteger(record.maxTravelMiles) ||
      !Number.isFinite(record.maxTravelMiles) ||
      (record.maxTravelMiles as number) < 3 ||
      (record.maxTravelMiles as number) > 25)
  ) {
    return { ok: false };
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'backgroundCleared') &&
    typeof record.backgroundCleared !== 'boolean'
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: record as ValidatedProgressPatch,
    keys,
  };
}

function completedOnboardingSteps(
  events: Array<{ stepNumber: number; actionType: string }>
): number[] {
  return [
    ...new Set(
      events
        .filter(
          (event) =>
            isOnboardingCompletionEvent(event)
        )
        .map((event) => event.stepNumber)
    ),
  ].sort((left, right) => left - right);
}

function hasDurableCertificateEvidence(formData: unknown): boolean {
  const coach = asRecord(asRecord(formData).fortyHourCoach);
  return (
    coach.step === 'UPLOADED' &&
    typeof coach.uploadedAt === 'string' &&
    coach.uploadedAt.length > 0 &&
    typeof coach.certStoragePath === 'string' &&
    coach.certStoragePath.length > 0
  );
}

function hasDurableSimulationEvidence(formData: unknown): boolean {
  const sim = asRecord(asRecord(formData).simulationAttempt);
  return sim.passed === true || sim.completed === true;
}

function crmBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function hrmBaseUrl() {
  return (process.env.NEXT_PUBLIC_HRM_URL || 'http://localhost:3001').replace(/\/$/, '');
}

function readErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return undefined;
  }

  return typeof error.message === 'string' ? error.message : undefined;
}

function mapRoleApplied(appliedRole: string): AtsCandidateData['roleApplied'] {
  if (appliedRole === 'BCBA') return 'BCBA';
  if (appliedRole === 'ADMIN' || appliedRole === 'CLINICAL_DIRECTOR') return 'ADMIN';
  return 'RBT';
}

function toCandidateRow(c: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  appliedRole: string;
  stage: string;
  activationStatus: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  dossier: unknown;
  onboardingPacket: {
    magicLinkToken: string | null;
    tasksDone?: boolean;
    availabilityDone?: boolean;
    simulationDone?: boolean;
    interviewBooked?: boolean;
    interviewPassed?: boolean;
    certUploaded?: boolean;
    backgroundCleared?: boolean;
    clearedForHire?: boolean;
  } | null;
  helpTickets?: Array<{
    id: string;
    status: string;
    subject: string;
    claimedByUserId: string | null;
    messages: Array<{ body: string }>;
  }>;
}): AtsCandidateData & { updatedAt: string } {
  const dossier =
    c.dossier && typeof c.dossier === 'object' ? (c.dossier as Record<string, unknown>) : {};
  const experienceYears =
    typeof dossier.experienceYears === 'number' ? dossier.experienceYears : 0;
  const openTicket = c.helpTickets?.[0];
  const progress = {
    ...readProgressFromPacket(c.onboardingPacket, c.dossier),
    helpDeskOpen: !!openTicket || readProgressFromPacket(c.onboardingPacket, c.dossier).helpDeskOpen,
  };
  const reqCount = [
    progress.tasksDone,
    progress.simulationDone,
    progress.availabilityDone,
    progress.interviewPassed,
    progress.certUploaded,
  ].filter(Boolean).length;

  let helpTicketCategory: string | null = null;
  let helpTicketMessage: string | null = null;
  if (openTicket) {
    const subjectMatch = openTicket.subject.match(/^\[([A-Z0-9_]+)\]\s*(.*)$/);
    helpTicketCategory = subjectMatch?.[1] || 'GENERAL_QUESTION';
    try {
      const first = openTicket.messages[0]?.body;
      if (first) {
        const parsed = JSON.parse(first);
        if (parsed && typeof parsed.text === 'string') helpTicketMessage = parsed.text;
        if (parsed?.category) helpTicketCategory = parsed.category;
      }
    } catch {
      helpTicketMessage = openTicket.messages[0]?.body || null;
    }
  }

  const derivedStage = deriveAtsStage({
    activationStatus: c.activationStatus,
    currentStage: c.stage,
    progress,
  });

  return {
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim(),
    email: c.email,
    phone: c.phone || '',
    roleApplied: mapRoleApplied(c.appliedRole),
    stage: derivedStage,
    experienceYears,
    appliedDate: c.createdAt.toISOString().split('T')[0],
    updatedAt: c.updatedAt.toISOString(),
    activationStatus: (c.activationStatus as AtsActivationStatus) || 'PENDING_HR_REVIEW',
    userId: c.userId,
    magicLinkToken: c.onboardingPacket?.magicLinkToken ?? null,
    reqTasks: progress.tasksDone,
    reqAvail: progress.availabilityDone,
    reqSim: progress.simulationDone,
    interviewBooked: progress.interviewBooked,
    reqInterview: progress.interviewPassed,
    reqCount,
    certUploaded: progress.certUploaded,
    backgroundCleared: progress.backgroundCleared,
    helpTicketId: openTicket?.id ?? null,
    helpTicketCategory,
    helpTicketMessage,
    helpTicketStatus: openTicket?.status ?? null,
    helpTicketClaimedByUserId: openTicket?.claimedByUserId ?? null,
  };
}

export async function getAtsCandidates(): Promise<{
  success: boolean;
  data: (AtsCandidateData & { updatedAt: string })[];
  error?: string;
}> {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const rows = await prisma.atsCandidate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        onboardingPacket: { select: PACKET_PROGRESS_SELECT },
        helpTickets: {
          where: { status: { in: ['OPEN', 'CLAIMED', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            subject: true,
            claimedByUserId: true,
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { body: true },
            },
          },
        },
      },
    });

    return { success: true, data: rows.map(toCandidateRow) };
  } catch (error: unknown) {
    console.error('Error fetching ATS candidates:', error instanceof Error ? error.message : error);
    return {
      success: false,
      data: [],
      error: readErrorMessage(error) || 'Failed to load candidates.',
    };
  }
}
const RBT_MANAGER_ROSTER_LIMIT = 200;
const RBT_MANAGER_SESSION_LIMIT = 2_000;

export type RbtManagerStaffRow = RbtManagerStaffWorkMetrics & {
  id: string;
  candidateId: string | null;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  experienceYears: number;
  staffSinceLabel: string | null;
  accountStatus:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'PENDING_ACCOUNT'
    | 'DEVICE_SESSION_ONLY';
  isActive: boolean;
  bacbOnFile: boolean;
  bacbVerified: boolean;
  caseloadCount: number;
};

export type RbtManagerDashboardData = {
  staff: RbtManagerStaffRow[];
  summary: {
    activeRbtAccounts: number;
    totalRbtAccounts: number;
    pendingAccountLinks: number;
    bacbVerifiedCandidates: number;
  } & RbtManagerStaffWorkMetrics;
  weekLabel: string;
  generatedAtLabel: string;
  limits: {
    rosterLimited: boolean;
    sessionsLimited: boolean;
    rosterLimit: number;
    sessionLimit: number;
  };
};

export type RbtManagerDashboardResult =
  | { success: true; data: RbtManagerDashboardData }
  | { success: false; data: null; error: string };

/**
 * Manager-only RBT operations snapshot. Every row is sourced from User,
 * AtsCandidate, Session/SessionNote, Client assignments, and ActionItem.
 */
export async function getRbtManagerDashboard(): Promise<RbtManagerDashboardResult> {
  const gate = await requireStaff(HR_ROLES);
  if (!gate.ok) {
    return { success: false, data: null, error: gate.error };
  }

  try {
    const now = new Date();
    const week = getRbtManagerWeekWindow(now);
    const rosterQueryLimit = RBT_MANAGER_ROSTER_LIMIT + 1;

    const [
      rbtUsersRaw,
      hiredCandidatesRaw,
      activeRbtAccounts,
      totalRbtAccounts,
      pendingAccountLinks,
      bacbVerifiedCandidates,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'RBT' },
        orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        take: rosterQueryLimit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          createdAt: true,
          _count: { select: { clientsAsRbt: true } },
        },
      }),
      prisma.atsCandidate.findMany({
        where: {
          stage: 'HIRED',
          appliedRole: 'RBT',
        },
        orderBy: { updatedAt: 'desc' },
        take: rosterQueryLimit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          bacbVerified: true,
          dossier: true,
          userId: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              isActive: true,
              createdAt: true,
              _count: { select: { clientsAsRbt: true } },
            },
          },
        },
      }),
      prisma.user.count({ where: { role: 'RBT', isActive: true } }),
      prisma.user.count({ where: { role: 'RBT' } }),
      prisma.atsCandidate.count({
        where: { stage: 'HIRED', appliedRole: 'RBT', userId: null },
      }),
      prisma.atsCandidate.count({
        where: { stage: 'HIRED', appliedRole: 'RBT', bacbVerified: true },
      }),
    ]);

    const rbtUsers = rbtUsersRaw.slice(0, RBT_MANAGER_ROSTER_LIMIT);
    const hiredCandidates = hiredCandidatesRaw.slice(0, RBT_MANAGER_ROSTER_LIMIT);
    const byUserId = new Map<string, RbtManagerStaffRow>();
    const byEmail = new Map<string, RbtManagerStaffRow>();

    for (const user of rbtUsers) {
      const row: RbtManagerStaffRow = {
        id: user.id,
        candidateId: null,
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phone: '',
        experienceYears: 0,
        staffSinceLabel: formatManagerEtDate(user.createdAt),
        accountStatus: user.isActive ? 'ACTIVE' : 'INACTIVE',
        isActive: user.isActive,
        bacbOnFile: false,
        bacbVerified: false,
        caseloadCount: user._count.clientsAsRbt,
        sessionsThisWeek: 0,
        completedSessions: 0,
        inProgressSessions: 0,
        payrollReadyHours: 0,
        payrollReadySessions: 0,
        payrollHeldSessions: 0,
        openTasks: 0,
        overdueTasks: 0,
        estimatedUnitSessions: 0,
      };
      byUserId.set(user.id, row);
      byEmail.set(user.email.trim().toLowerCase(), row);
    }

    const candidateOnlyRows: RbtManagerStaffRow[] = [];
    for (const candidate of hiredCandidates) {
      const dossier =
        candidate.dossier && typeof candidate.dossier === 'object'
          ? (candidate.dossier as Record<string, unknown>)
          : {};
      const rawExperience = dossier.experienceYears;
      const experienceYears =
        typeof rawExperience === 'number' && Number.isFinite(rawExperience)
          ? Math.max(0, rawExperience)
          : 0;
      const linked =
        (candidate.userId ? byUserId.get(candidate.userId) : undefined) ??
        byEmail.get(candidate.email.trim().toLowerCase());

      if (linked) {
        linked.candidateId = candidate.id;
        linked.name = `${candidate.firstName} ${candidate.lastName}`.trim() || linked.name;
        linked.phone = candidate.phone ?? '';
        linked.experienceYears = experienceYears;
        linked.accountStatus = 'DEVICE_SESSION_ONLY';
        linked.bacbOnFile = true;
        linked.bacbVerified = candidate.bacbVerified;
        continue;
      }

      const user = candidate.user;
      const row: RbtManagerStaffRow = {
        id: user?.id ?? candidate.id,
        candidateId: candidate.id,
        userId: user?.id ?? null,
        name: `${candidate.firstName} ${candidate.lastName}`.trim(),
        email: user?.email ?? candidate.email,
        phone: candidate.phone ?? '',
        experienceYears,
        staffSinceLabel: user ? formatManagerEtDate(user.createdAt) : null,
        accountStatus: user ? 'DEVICE_SESSION_ONLY' : 'PENDING_ACCOUNT',
        isActive: user?.isActive ?? false,
        bacbOnFile: true,
        bacbVerified: candidate.bacbVerified,
        caseloadCount: user?._count.clientsAsRbt ?? 0,
        sessionsThisWeek: 0,
        completedSessions: 0,
        inProgressSessions: 0,
        payrollReadyHours: 0,
        payrollReadySessions: 0,
        payrollHeldSessions: 0,
        openTasks: 0,
        overdueTasks: 0,
        estimatedUnitSessions: 0,
      };
      candidateOnlyRows.push(row);
      if (user) byUserId.set(user.id, row);
    }

    const statusRank = {
      ACTIVE: 0,
      DEVICE_SESSION_ONLY: 1,
      PENDING_ACCOUNT: 2,
      INACTIVE: 3,
    } as const;
    const allRows = [...byUserId.values(), ...candidateOnlyRows]
      .filter((row, index, rows) => rows.findIndex((item) => item.id === row.id) === index)
      .sort(
        (a, b) =>
          statusRank[a.accountStatus] - statusRank[b.accountStatus] ||
          a.name.localeCompare(b.name),
      );
    const staff = allRows.slice(0, RBT_MANAGER_ROSTER_LIMIT);
    const userIds = staff.flatMap((row) => (row.userId ? [row.userId] : []));

    const [sessionRowsRaw, openTaskGroups, overdueTaskGroups] =
      userIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            prisma.session.findMany({
              where: {
                rbtId: { in: userIds },
                scheduledStart: { gte: week.start, lt: week.endExclusive },
                status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
              },
              orderBy: { scheduledStart: 'desc' },
              take: RBT_MANAGER_SESSION_LIMIT + 1,
              select: {
                rbtId: true,
                status: true,
                cptCode: true,
                scheduledStart: true,
                scheduledEnd: true,
                actualStart: true,
                actualEnd: true,
                note: {
                  select: {
                    parentSigned: true,
                    parentSignedAt: true,
                    parentSignerName: true,
                    rbtSigned: true,
                    rbtSignedAt: true,
                    rbtSignerName: true,
                    bcbaSigned: true,
                    bcbaSignedAt: true,
                    bcbaSignerName: true,
                    isConverted: true,
                    billableUnits: true,
                    checklistSnapshot: true,
                    structuredContent: true,
                    deficiencies: {
                      where: { status: 'OPEN' },
                      select: { id: true },
                    },
                  },
                },
              },
            }),
            prisma.actionItem.groupBy({
              by: ['assigneeId'],
              where: {
                assigneeId: { in: userIds },
                status: { in: ['OPEN', 'IN_PROGRESS'] },
              },
              _count: { _all: true },
              orderBy: { assigneeId: 'asc' },
              take: RBT_MANAGER_ROSTER_LIMIT,
            }),
            prisma.actionItem.groupBy({
              by: ['assigneeId'],
              where: {
                assigneeId: { in: userIds },
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                dueDate: { lt: startOfClinicDay(now) },
              },
              _count: { _all: true },
              orderBy: { assigneeId: 'asc' },
              take: RBT_MANAGER_ROSTER_LIMIT,
            }),
          ]);

    const sessionRows = sessionRowsRaw
      .slice(0, RBT_MANAGER_SESSION_LIMIT)
      .map((session) => ({
        ...session,
        note: session.note
          ? {
              parentSigned: session.note.parentSigned,
              parentSignedAt: session.note.parentSignedAt,
              parentSignerName: session.note.parentSignerName,
              rbtSigned: session.note.rbtSigned,
              rbtSignedAt: session.note.rbtSignedAt,
              rbtSignerName: session.note.rbtSignerName,
              bcbaSigned: session.note.bcbaSigned,
              bcbaSignedAt: session.note.bcbaSignedAt,
              bcbaSignerName: session.note.bcbaSignerName,
              isConverted: session.note.isConverted,
              billableUnits: session.note.billableUnits,
              checklistSnapshot: session.note.checklistSnapshot,
              openDeficiencyCount: session.note.deficiencies.length,
              submissionFingerprint: extractSubmissionFingerprint(
                session.note.structuredContent,
              ),
            }
          : null,
      }));
    const openTaskCounts = new Map(
      openTaskGroups.flatMap((group) =>
        group.assigneeId ? [[group.assigneeId, group._count._all] as const] : [],
      ),
    );
    const overdueTaskCounts = new Map(
      overdueTaskGroups.flatMap((group) =>
        group.assigneeId ? [[group.assigneeId, group._count._all] as const] : [],
      ),
    );
    const work = summarizeRbtManagerWork({
      userIds,
      sessions: sessionRows,
      openTaskCounts,
      overdueTaskCounts,
    });

    for (const row of staff) {
      if (!row.userId) continue;
      const metrics = work.byUserId[row.userId];
      if (metrics) Object.assign(row, metrics);
    }

    const rosterLimited =
      rbtUsersRaw.length > RBT_MANAGER_ROSTER_LIMIT ||
      hiredCandidatesRaw.length > RBT_MANAGER_ROSTER_LIMIT ||
      allRows.length > RBT_MANAGER_ROSTER_LIMIT;

    return {
      success: true,
      data: {
        staff,
        summary: {
          activeRbtAccounts,
          totalRbtAccounts,
          pendingAccountLinks,
          bacbVerifiedCandidates,
          ...work.totals,
        },
        weekLabel: week.label,
        generatedAtLabel: formatManagerEtTimestamp(now),
        limits: {
          rosterLimited,
          sessionsLimited: sessionRowsRaw.length > RBT_MANAGER_SESSION_LIMIT,
          rosterLimit: RBT_MANAGER_ROSTER_LIMIT,
          sessionLimit: RBT_MANAGER_SESSION_LIMIT,
        },
      },
    };
  } catch (error: unknown) {
    console.error(
      'Action failed [getRbtManagerDashboard]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false,
      data: null,
      error: 'Could not load the RBT manager dashboard. Please try again.',
    };
  }
}
export type HiredRbtStaffRow = RbtManagerStaffRow;

export async function getHiredRbtStaff(): Promise<{
  success: boolean;
  data: HiredRbtStaffRow[];
  error?: string;
}> {
  const gate = await requireStaff(HR_ROLES);
  if (!gate.ok) return { success: false, data: [], error: gate.error };

  const result = await getRbtManagerDashboard();
  return result.success
    ? { success: true, data: result.data.staff }
    : { success: false, data: [], error: result.error };
}

/** HIRED-candidate linkage: real RBT user + case-opening claim state (no demo rows). */
export type HiredCandidateSummary = {
  linkedUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    caseloadCount: number;
  } | null;
  caseApplications: Array<{
    id: string;
    status: string;
    caseCode: string;
    borough: string | null;
    weeklyHours: number | null;
    openingStatus: string;
    updatedAt: string;
  }>;
};

export async function getHiredCandidateSummary(candidateId: string): Promise<{
  success: boolean;
  data?: HiredCandidateSummary;
  error?: string;
}> {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
            _count: { select: { clientsAsRbt: true } },
          },
        },
      },
    });
    if (!candidate) return { success: false, error: 'Candidate not found.' };

    const applications = candidate.userId
      ? await prisma.caseApplication.findMany({
          where: { rbtUserId: candidate.userId },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            status: true,
            updatedAt: true,
            opening: {
              select: {
                caseCode: true,
                status: true,
                borough: true,
                weeklyHours: true,
              },
            },
          },
        })
      : [];

    return {
      success: true,
      data: {
        linkedUser: candidate.user
          ? {
              id: candidate.user.id,
              name: `${candidate.user.firstName} ${candidate.user.lastName}`.trim(),
              email: candidate.user.email,
              role: candidate.user.role,
              isActive: candidate.user.isActive,
              caseloadCount: candidate.user._count.clientsAsRbt,
            }
          : null,
        caseApplications: applications.map((a) => ({
          id: a.id,
          status: a.status,
          caseCode: a.opening.caseCode,
          borough: a.opening.borough,
          weeklyHours: a.opening.weeklyHours,
          openingStatus: a.opening.status,
          updatedAt: a.updatedAt.toISOString(),
        })),
      },
    };
  } catch (error: unknown) {
    console.error(
      'getHiredCandidateSummary failed:',
      error instanceof Error ? error.message : error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load hired candidate summary.',
    };
  }
}
export async function addAtsCandidate(data: {
  name: string;
  email: string;
  phone?: string;
  roleApplied: 'RBT' | 'BCBA' | 'ADMIN';
  experienceYears?: number;
}) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const name = String(data.name || '').trim();
    const email = String(data.email || '').toLowerCase().trim();
    const phone = data.phone === undefined ? '' : String(data.phone).trim();
    const experienceYears = data.experienceYears ?? 0;
    if (name.length < 2 || name.length > 160) {
      return { success: false, error: 'Candidate name must be between 2 and 160 characters.' };
    }
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return { success: false, error: 'Enter a valid candidate email address.' };
    }
    if (phone.length > 32) {
      return { success: false, error: 'Candidate phone must be 32 characters or fewer.' };
    }
    if (
      !Number.isFinite(experienceYears) ||
      !Number.isInteger(experienceYears) ||
      experienceYears < 0 ||
      experienceYears > 80
    ) {
      return { success: false, error: 'Experience years must be a whole number from 0 to 80.' };
    }
    if (!['RBT', 'BCBA', 'ADMIN'].includes(data.roleApplied)) {
      return { success: false, error: 'Candidate role is invalid.' };
    }

    const nameParts = name.split(/\s+/);
    const firstName = nameParts[0] || 'Applicant';
    const lastName = nameParts.slice(1).join(' ') || 'Candidate';
    const appliedRole =
      data.roleApplied === 'BCBA'
        ? 'BCBA'
        : data.roleApplied === 'ADMIN'
          ? 'ADMIN'
          : 'RBT';

    const existing = await prisma.atsCandidate.findUnique({ where: { email } });
    if (existing) {
      return { success: false, error: 'A candidate with this email already exists.' };
    }

    const candidate = await prisma.atsCandidate.create({
      data: {
        firstName,
        lastName,
        email,
        phone: phone || null,
        appliedRole,
        stage: 'APPLIED',
        activationStatus: 'PENDING_HR_REVIEW',
        dossier: { experienceYears },
        onboardingPacket: {
          create: {
            magicLinkToken: crypto.randomUUID(),
            magicLinkExpiresAt: newMagicLinkExpiry(),
            formData: {},
          },
        },
      },
      include: { onboardingPacket: { select: PACKET_PROGRESS_SELECT } },
    });

    revalidatePath('/ats');

    return { success: true, candidate: toCandidateRow(candidate) };
  } catch (error: unknown) {
    console.error('Error adding ATS candidate:', error instanceof Error ? error.message : error);
    return { success: false, error: readErrorMessage(error) || 'Failed to add applicant.' };
  }
}

export async function setAtsStage(
  candidateId: string,
  stage: AtsStage,
  activationStatus?: AtsActivationStatus,
  expectedCurrentStage?: AtsStage
) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    if (!ATS_STAGE_VALUES.has(stage)) {
      return { success: false, error: 'Invalid ATS stage.' };
    }
    if (stage === 'HIRED') {
      return {
        success: false,
        error: 'HIRED is restricted to the canonical hiring action.',
      };
    }
    if (
      (activationStatus && !ATS_ACTIVATION_VALUES.has(activationStatus)) ||
      (stage !== 'REJECTED' && activationStatus === 'REJECTED')
    ) {
      return { success: false, error: 'Invalid ATS activation state.' };
    }

    const data: { stage: string; activationStatus?: string } = { stage };
    if (activationStatus) data.activationStatus = activationStatus;
    if (stage === 'REJECTED') data.activationStatus = 'REJECTED';

    const result = await prisma.$transaction(
      async (tx) => {
        const current = await tx.atsCandidate.findUnique({
          where: { id: candidateId },
          select: { stage: true },
        });
        if (!current) {
          return { success: false as const, error: 'Candidate not found.' };
        }
        if (expectedCurrentStage && current.stage !== expectedCurrentStage) {
          return {
            success: false as const,
            error: 'Candidate stage changed. Reload the ATS board before advancing.',
          };
        }
        if (current.stage === 'HIRED') {
          return {
            success: false as const,
            error: 'A hired candidate cannot be moved by the generic stage action.',
          };
        }
        if (current.stage === 'REJECTED' && stage !== 'REJECTED') {
          return {
            success: false as const,
            error: 'A rejected candidate cannot be reactivated by the generic stage action.',
          };
        }

        const candidate = await tx.atsCandidate.update({
          where: { id: candidateId },
          data,
          include: { onboardingPacket: { select: PACKET_PROGRESS_SELECT } },
        });

        if (stage === 'REJECTED') {
          const revokedAt = new Date();
          await Promise.all([
            tx.applicantDeviceSession.updateMany({
              where: { candidateId, revokedAt: null },
              data: { revokedAt },
            }),
            tx.candidateOnboardingPacket.updateMany({
              where: { candidateId },
              data: { magicLinkRevokedAt: revokedAt },
            }),
          ]);
        }
        return { success: true as const, candidate };
      },
      { isolationLevel: 'Serializable' }
    );
    if (!result.success) return result;

    revalidatePath('/ats');
    return { success: true, candidate: toCandidateRow(result.candidate) };
  } catch (error: unknown) {
    console.error('Error setting ATS stage:', error instanceof Error ? error.message : error);
    return { success: false, error: readErrorMessage(error) || 'Failed to update stage.' };
  }
}

export async function advanceAtsStage(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const current = await prisma.atsCandidate.findUnique({ where: { id: candidateId } });
    if (!current) return { success: false, error: 'Candidate not found.' };

    const idx = STAGE_ORDER.indexOf(current.stage as AtsStage);
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) {
      return { success: false, error: 'Cannot advance this stage.' };
    }

    const next = STAGE_ORDER[idx + 1];
    if (next === 'HIRED') {
      return {
        success: false,
        error: 'Use the explicit final hire action for this transition.',
      };
    }

    return setAtsStage(
      candidateId,
      next,
      undefined,
      current.stage as AtsStage
    );
  } catch (error: unknown) {
    return { success: false, error: readErrorMessage(error) || 'Failed to advance stage.' };
  }
}

export async function inviteCandidate(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const token = crypto.randomUUID();
    const now = new Date();
    const updated = await prisma.$transaction(
      async (tx) => {
        const candidate = await tx.atsCandidate.findUnique({
          where: { id: candidateId },
          select: {
            id: true,
            stage: true,
            onboardingPacket: { select: { id: true } },
          },
        });
        if (!candidate) return null;
        if (candidate.stage === 'HIRED' || candidate.stage === 'REJECTED') {
          return { terminalStage: candidate.stage } as const;
        }

        if (candidate.onboardingPacket) {
          await tx.candidateOnboardingPacket.update({
            where: { candidateId },
            data: {
              magicLinkToken: token,
              magicLinkExpiresAt: newMagicLinkExpiry(),
              magicLinkRevokedAt: null,
              inviteSentAt: now,
              inviteAcceptedAt: null,
              deviceFingerprint: null,
              deviceBoundAt: null,
            },
          });
        } else {
          await tx.candidateOnboardingPacket.create({
            data: {
              candidateId,
              magicLinkToken: token,
              magicLinkExpiresAt: newMagicLinkExpiry(),
              formData: {},
              inviteSentAt: now,
            },
          });
        }

        await tx.applicantDeviceSession.updateMany({
          where: { candidateId, revokedAt: null },
          data: { revokedAt: now },
        });

        return tx.atsCandidate.update({
          where: { id: candidateId },
          data: {
            stage: 'PHONE_SCREEN',
            activationStatus: 'INVITATION_SENT',
          },
          include: { onboardingPacket: { select: PACKET_PROGRESS_SELECT } },
        });
      },
      { isolationLevel: 'Serializable' }
    );
    if (!updated) return { success: false, error: 'Candidate not found.' };
    if ('terminalStage' in updated) {
      return {
        success: false,
        error: `A ${updated.terminalStage.toLowerCase()} candidate cannot be invited again.`,
      };
    }

    const magicLinkUrl = `${hrmBaseUrl()}/magic-link/${token}`;

    revalidatePath('/ats');
        return {
      success: true,
      candidate: toCandidateRow(updated),
      magicLinkUrl,
      message: 'Invitation ready. Copy the magic link (email send not configured yet).',
    };
  } catch (error: unknown) {
    console.error('inviteCandidate failed:', error instanceof Error ? error.message : error);
    return { success: false, error: readErrorMessage(error) || 'Failed to invite candidate.' };
  }
}

/** Staff: immediately kill an applicant's magic link (gap 7). Re-invite restores access. */
export async function revokeCandidateMagicLink(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const packet = await prisma.candidateOnboardingPacket.findUnique({
      where: { candidateId },
      select: { id: true },
    });
    if (!packet) return { success: false, error: 'No onboarding packet for this candidate.' };

    await prisma.candidateOnboardingPacket.update({
      where: { id: packet.id },
      data: { magicLinkRevokedAt: new Date() },
    });

    // Kill any device sessions bound to this candidate too.
    await prisma.applicantDeviceSession.updateMany({
      where: { candidateId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    revalidatePath('/ats');
    revalidatePath(`/ats/applicant/${candidateId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error('revokeCandidateMagicLink failed:', error instanceof Error ? error.message : error);
    return { success: false, error: readErrorMessage(error) || 'Failed to revoke magic link.' };
  }
}

export async function hireCandidate(candidateId: string) {
  const gate = await requireStaff(ATS_HIRING_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const result = await hireCandidateDomain({
      candidateId,
      actorUserId: gate.user.id,
      actorRole: gate.user.role,
      notificationLinkUrl: `${crmBaseUrl()}/portal-clinical`,
    });
    if (!result.success) return result;

    revalidatePath('/ats');
    revalidatePath('/rbt');
    revalidatePath('/rbt-manager');
    revalidatePath(`/ats/applicant/${candidateId}`);

    return {
      ...result,
      message: result.alreadyHired
        ? 'Candidate was already hired; returning the durable linked profile.'
        : 'Hire recorded. Existing fingerprint-bound candidate-device sessions, if any, remain the RBT access path; Supabase Auth credentials were not provisioned.',
    };
  } catch (error: unknown) {
    console.error('hireCandidate failed:', error instanceof Error ? error.message : error);
    return { success: false, error: readErrorMessage(error) || 'Failed to hire candidate.' };
  }
}

export async function rejectCandidate(candidateId: string) {
  return setAtsStage(candidateId, 'REJECTED', 'REJECTED');
}

export async function deleteAtsCandidate(candidateId: string) {
  const gate = await requireStaff(ATS_STAFF_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const candidate = await tx.atsCandidate.findUnique({
          where: { id: candidateId },
          select: {
            stage: true,
            activationStatus: true,
            userId: true,
            onboardingPacket: {
              select: {
                inviteSentAt: true,
                inviteAcceptedAt: true,
                resumeStoragePath: true,
                govtIdStoragePath: true,
                ls54StoragePath: true,
                w4Complete: true,
                i9Complete: true,
                directDepositComplete: true,
                cprUploaded: true,
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
            interview: { select: { id: true } },
            _count: {
              select: {
                helpTickets: true,
                interviewRecordings: true,
                deviceSessions: true,
                signatureEvents: true,
              },
            },
          },
        });

        if (!candidate) return 'missing' as const;

        const packet = candidate.onboardingPacket;
        const hasRetainedEvidence =
          candidate.stage !== 'APPLIED' ||
          candidate.activationStatus !== 'PENDING_HR_REVIEW' ||
          candidate.userId !== null ||
          candidate.interview !== null ||
          Object.values(candidate._count).some((count) => count > 0) ||
          Boolean(
            packet &&
              (packet.inviteSentAt ||
                packet.inviteAcceptedAt ||
                packet.resumeStoragePath ||
                packet.govtIdStoragePath ||
                packet.ls54StoragePath ||
                packet.w4Complete ||
                packet.i9Complete ||
                packet.directDepositComplete ||
                packet.cprUploaded ||
                packet.tasksDone ||
                packet.availabilityDone ||
                packet.simulationDone ||
                packet.interviewBooked ||
                packet.interviewPassed ||
                packet.certUploaded ||
                packet.backgroundCleared ||
                packet.clearedForHire)
          );

        if (hasRetainedEvidence) return 'retained' as const;

        await tx.atsCandidate.delete({ where: { id: candidateId } });
        return 'deleted' as const;
      },
      { isolationLevel: 'Serializable' }
    );

    if (outcome === 'missing') {
      return { success: false, error: 'Candidate not found.' };
    }
    if (outcome === 'retained') {
      return {
        success: false,
        error:
          'Candidates with onboarding, interview, or hiring evidence must be retained. Mark the candidate as rejected instead.',
      };
    }

    revalidatePath('/ats');
    return { success: true };
  } catch (error: unknown) {
    console.error('deleteAtsCandidate failed:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to delete candidate.' };
  }
}

/**
 * Persist applicant-owned availability data, refresh evidence-derived progress,
 * and recompute the ATS stage. Staff may additionally record background clearance.
 */
export async function updateCandidateProgress(
  candidateId: string,
  patch: OnboardingProgressPatch
) {
  try {
    const access = await authorizeCandidateProgress(candidateId);
    if (!access.ok) return { success: false, error: access.error };

    const validatedPatch = validateProgressPatch(patch, access.isStaff);
    if (!validatedPatch.ok) return invalidProgressUpdate();

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      include: {
        onboardingPacket: { select: PACKET_PROGRESS_SELECT },
        signatureEvents: {
          where: {
            actionType: { in: [...ONBOARDING_COMPLETION_ACTIONS] },
          },
          select: {
            stepNumber: true,
            actionType: true,
          },
        },
        interview: {
          select: {
            status: true,
            recommendation: true,
            completedAt: true,
          },
        },
        helpTickets: {
          where: {
            status: { in: ['OPEN', 'CLAIMED', 'IN_PROGRESS'] },
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!candidate) return { success: false, error: 'Candidate not found.' };

    const applicantDataKeys = validatedPatch.keys.filter((key) =>
      APPLICANT_PROGRESS_KEYS.has(key)
    );
    const mergedAvailability = {
      availability:
        validatedPatch.keys.includes('availabilityGrid')
          ? validatedPatch.value.availabilityGrid
          : candidate.onboardingPacket?.availabilityGrid,
      preferredBoroughs:
        validatedPatch.keys.includes('preferredBoroughs')
          ? validatedPatch.value.preferredBoroughs
          : candidate.onboardingPacket?.preferredBoroughs,
      transportation:
        validatedPatch.keys.includes('transportation')
          ? validatedPatch.value.transportation
          : candidate.onboardingPacket?.transportation,
      maxTravelMiles:
        validatedPatch.keys.includes('maxTravelMiles')
          ? validatedPatch.value.maxTravelMiles
          : candidate.onboardingPacket?.maxTravelMiles,
    };
    const validatedAvailability = validateAvailabilitySubmission(mergedAvailability);
    if (
      validatedPatch.keys.includes('availabilityGrid') &&
      !validatedAvailability.ok
    ) {
      return invalidProgressUpdate();
    }

    const tasksCompletedSteps = completedOnboardingSteps(
      candidate.signatureEvents
    );
    const tasksDone =
      tasksCompletedSteps.length === ONBOARDING_TOTAL_STEPS;
    const availabilityDone = validatedAvailability.ok;
    const simulationDone = hasDurableSimulationEvidence(
      candidate.onboardingPacket?.formData
    );
    const interviewBooked =
      candidate.interview !== null &&
      ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(
        candidate.interview.status
      );
    const interviewPassed =
      candidate.interview?.status === 'COMPLETED' &&
      candidate.interview.recommendation === 'ADVANCE' &&
      candidate.interview.completedAt !== null;
    const certUploaded = hasDurableCertificateEvidence(
      candidate.onboardingPacket?.formData
    );
    const backgroundCleared =
      validatedPatch.keys.includes('backgroundCleared')
        ? validatedPatch.value.backgroundCleared === true
        : candidate.onboardingPacket?.backgroundCleared === true;
    const helpDeskOpen = candidate.helpTickets.length > 0;
    const clearedForHire =
      tasksDone &&
      availabilityDone &&
      simulationDone &&
      interviewPassed &&
      certUploaded &&
      backgroundCleared;

    const nextProgress = {
      tasksDone,
      availabilityDone,
      simulationDone,
      interviewBooked,
      interviewPassed,
      certUploaded,
      backgroundCleared,
      clearedForHire,
      helpDeskOpen,
    };

    const packetData: Record<string, unknown> = {
      tasksDone: nextProgress.tasksDone,
      tasksCompletedSteps,
      availabilityDone: nextProgress.availabilityDone,
      simulationDone: nextProgress.simulationDone,
      interviewBooked: nextProgress.interviewBooked,
      interviewPassed: nextProgress.interviewPassed,
      certUploaded: nextProgress.certUploaded,
      backgroundCleared: nextProgress.backgroundCleared,
      clearedForHire: nextProgress.clearedForHire,
    };

    if (applicantDataKeys.length > 0) {
      if (validatedPatch.keys.includes('availabilityGrid')) {
        if (!validatedAvailability.ok) return invalidProgressUpdate();
        packetData.availabilityGrid = validatedAvailability.value.availability;
      }
      if (validatedPatch.keys.includes('preferredBoroughs')) {
        packetData.preferredBoroughs = validatedAvailability.ok
          ? validatedAvailability.value.preferredBoroughs
          : validatedPatch.value.preferredBoroughs;
      }
      if (validatedPatch.keys.includes('transportation')) {
        packetData.transportation = validatedAvailability.ok
          ? validatedAvailability.value.transportation
          : validatedPatch.value.transportation;
      }
      if (validatedPatch.keys.includes('maxTravelMiles')) {
        packetData.maxTravelMiles = validatedAvailability.ok
          ? validatedAvailability.value.maxTravelMiles
          : validatedPatch.value.maxTravelMiles;
      }
    }

    const nextStage = deriveAtsStage({
      activationStatus: candidate.activationStatus,
      currentStage: candidate.stage,
      progress: nextProgress,
    });

    // Keep dossier.progress in sync for any leftover readers; packet is SoT.
    const dossier = asRecord(candidate.dossier);

    const updated = await prisma.atsCandidate.update({
      where: {
        id: candidateId,
        stage: candidate.stage,
        activationStatus: candidate.activationStatus,
      },
      data: {
        stage: nextStage,
        dossier: {
          ...dossier,
          progress: nextProgress,
        },
        onboardingPacket: {
          upsert: {
            create: {
              magicLinkToken: crypto.randomUUID(),
              magicLinkExpiresAt: newMagicLinkExpiry(),
              formData: {},
              ...packetData,
            },
            update: packetData,
          },
        },
      },
      include: { onboardingPacket: { select: PACKET_PROGRESS_SELECT } },
    });

    revalidatePath('/ats');

    return {
      success: true,
      candidate: toCandidateRow(updated),
      progress: nextProgress,
      stage: nextStage,
      snapshot: snapshotFromPacket(updated.onboardingPacket, updated.dossier),
    };
  } catch (error: unknown) {
    console.error(
      'updateCandidateProgress failed:',
      error instanceof Error ? error.message : error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update progress.',
    };
  }
}
export async function getOnboardingProgress(candidateId: string): Promise<{
  success: boolean;
  data?: OnboardingProgressSnapshot;
  stage?: string;
  activationStatus?: string;
  error?: string;
}> {
  try {
    const access = await authorizeCandidateProgress(candidateId);
    if (!access.ok) return { success: false, error: access.error };

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      include: { onboardingPacket: { select: PACKET_PROGRESS_SELECT } },
    });
    if (!candidate) return { success: false, error: 'Candidate not found.' };

    return {
      success: true,
      data: snapshotFromPacket(candidate.onboardingPacket, candidate.dossier),
      stage: candidate.stage,
      activationStatus: candidate.activationStatus,
    };
  } catch (error: unknown) {
    console.error(
      'getOnboardingProgress failed:',
      error instanceof Error ? error.message : error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load progress.',
    };
  }
}
