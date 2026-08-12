'use server';

import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import { getCurrentUser } from '@/lib/auth';
import { ONBOARDING_PACK_VERSION, ONBOARDING_TOTAL_STEPS } from '@/lib/onboardingDocuments';
import {
  asRecord,
  deriveAtsStage,
  readProgressFromPacket,
  type OnboardingProgressPatch,
} from '@/lib/atsStage';
import {
  DEMO_STUDIO_GUARDIAN_EMAIL as SHARED_DEMO_STUDIO_GUARDIAN_EMAIL,
  demoClaimReadySessionIds,
  demoIncompleteSessionIds,
  seedConnectedProductDemo,
  toDevSeedDiagnostic,
  type DevStudioSeedMode as SharedDevStudioSeedMode,
  type DevStudioSeedResult as SharedDevStudioSeedResult,
  type Prisma,
} from '@repo/db';

const SESSION_COOKIE = 'ras_device_session_token';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertDevToolsEnabled() {
  return isDevToolsEnabled();
}

export type DevSkipMode = 'PACK_ONLY' | 'ALL_EXCEPT_OFFER';

export async function setImpersonationCookie(userId: string | null, role: string | null = null) {
  if (!assertDevToolsEnabled()) {
    return { success: false, error: 'Dev tools disabled' };
  }

  const cookieStore = await cookies();

  if (userId) {
    cookieStore.set('dev_impersonate_user_id', userId, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    cookieStore.delete('dev_impersonate_role');
  } else if (role) {
    cookieStore.set('dev_impersonate_role', role, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    cookieStore.delete('dev_impersonate_user_id');
  } else {
    cookieStore.delete('dev_impersonate_user_id');
    cookieStore.delete('dev_impersonate_role');
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

/** Dev-only: resolve seeded David Miller User.id after Seed Studio / payroll demo. */
export async function resolveDemoRbtUserId() {
  try {
    if (!assertDevToolsEnabled()) {
      return { success: false as const, error: 'Dev tools disabled', data: null as string | null };
    }

    const user = await prisma.user.findFirst({
      where: {
        role: 'RBT',
        isActive: true,
        OR: [
          { email: { equals: 'david.m@riseandshine.nyc', mode: 'insensitive' } },
          { email: { contains: 'david', mode: 'insensitive' } },
          { firstName: { equals: 'David', mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true },
      orderBy: { updatedAt: 'desc' },
    });

    return { success: true as const, data: user?.id ?? null };
  } catch (error) {
    console.error(
      'Action failed [resolveDemoRbtUserId]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to resolve demo RBT.', data: null };
  }
}

/**
 * Dev-only: mark onboarding pack (and optionally other requirements) complete
 * so you can exercise wage-offer → hire without filling every form.
 */
export async function devSkipApplicantRequirements(
  mode: DevSkipMode = 'PACK_ONLY',
  candidateIdOverride?: string | null
) {
  try {
    if (!assertDevToolsEnabled()) {
      return { success: false as const, error: 'Dev tools disabled' };
    }

    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(SESSION_COOKIE)?.value || null;
    const candidateId =
      (candidateIdOverride && UUID_RE.test(candidateIdOverride) && candidateIdOverride) ||
      (fromCookie && UUID_RE.test(fromCookie) ? fromCookie : null);

    if (!candidateId) {
      return {
        success: false as const,
        error: 'No active applicant session. Impersonate an applicant first.',
      };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      include: { onboardingPacket: true },
    });
    if (!candidate) {
      return { success: false as const, error: 'Candidate not found.' };
    }

    const allSteps = Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => i + 1);
    const packOnly = mode === 'PACK_ONLY';

    const patch: OnboardingProgressPatch = {
      tasksDone: true,
      tasksCompletedSteps: allSteps,
      ...(packOnly
        ? {}
        : {
            availabilityDone: true,
            simulationDone: true,
            interviewBooked: true,
            interviewPassed: true,
            certUploaded: true,
            clearedForHire: true,
          }),
    };

    const prev = readProgressFromPacket(candidate.onboardingPacket, candidate.dossier);
    const nextProgress = {
      tasksDone: true,
      availabilityDone: packOnly ? !!prev.availabilityDone : true,
      simulationDone: packOnly ? !!prev.simulationDone : true,
      interviewBooked: packOnly ? !!prev.interviewBooked : true,
      interviewPassed: packOnly ? !!prev.interviewPassed : true,
      certUploaded: packOnly ? !!prev.certUploaded : true,
      backgroundCleared: !!prev.backgroundCleared,
      clearedForHire: packOnly ? !!prev.clearedForHire : true,
      helpDeskOpen: !!prev.helpDeskOpen,
    };

    const nextStage = deriveAtsStage({
      activationStatus: candidate.activationStatus,
      currentStage: candidate.stage,
      progress: nextProgress,
    });

    const dossier = asRecord(candidate.dossier);
    const prevForm =
      candidate.onboardingPacket?.formData &&
      typeof candidate.onboardingPacket.formData === 'object' &&
      !Array.isArray(candidate.onboardingPacket.formData)
        ? (candidate.onboardingPacket.formData as Record<string, unknown>)
        : {};

    await prisma.atsCandidate.update({
      where: { id: candidateId },
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
              tasksDone: true,
              tasksCompletedSteps: allSteps,
              availabilityDone: nextProgress.availabilityDone,
              simulationDone: nextProgress.simulationDone,
              interviewBooked: nextProgress.interviewBooked,
              interviewPassed: nextProgress.interviewPassed,
              certUploaded: nextProgress.certUploaded,
              clearedForHire: nextProgress.clearedForHire,
              w4Complete: true,
              directDepositComplete: true,
              i9Complete: true,
              cprUploaded: nextProgress.certUploaded,
              formData: {
                ...prevForm,
                embeddedForms: {
                  ...(typeof prevForm.embeddedForms === 'object' && prevForm.embeddedForms
                    ? (prevForm.embeddedForms as object)
                    : {}),
                  __devSkipped: {
                    mode,
                    at: new Date().toISOString(),
                    note: 'Dev tools skip — not a real form submission',
                  },
                },
              } as Prisma.InputJsonValue,
            },
            update: {
              tasksDone: true,
              tasksCompletedSteps: allSteps,
              availabilityDone: nextProgress.availabilityDone,
              simulationDone: nextProgress.simulationDone,
              interviewBooked: nextProgress.interviewBooked,
              interviewPassed: nextProgress.interviewPassed,
              certUploaded: nextProgress.certUploaded,
              clearedForHire: nextProgress.clearedForHire,
              w4Complete: true,
              directDepositComplete: true,
              i9Complete: true,
              cprUploaded: nextProgress.certUploaded,
              formData: {
                ...prevForm,
                embeddedForms: {
                  ...(typeof prevForm.embeddedForms === 'object' && prevForm.embeddedForms
                    ? (prevForm.embeddedForms as object)
                    : {}),
                  __devSkipped: {
                    mode,
                    at: new Date().toISOString(),
                    note: 'Dev tools skip — not a real form submission',
                  },
                },
              } as Prisma.InputJsonValue,
            },
          },
        },
      },
    });

    // One audit breadcrumb so the trail shows the pack was skipped in demo
    const createdAt = new Date();
    const auditHash = createHash('sha256')
      .update(
        JSON.stringify({
          candidateId,
          action: 'DEV_SKIPPED',
          mode,
          pack: ONBOARDING_PACK_VERSION,
          ts: createdAt.toISOString(),
        })
      )
      .digest('hex');

    await prisma.onboardingSignatureEvent.create({
      data: {
        candidateId,
        stepNumber: ONBOARDING_TOTAL_STEPS,
        documentKey: 'dev-skip',
        documentTitle: packOnly
          ? 'DEV: Onboarding pack skipped'
          : 'DEV: All requirements skipped (except LS-54 hire gate)',
        documentVersion: ONBOARDING_PACK_VERSION,
        actionType: 'ADVANCED',
        signerName: 'DEV TOOLS',
        consents: { read: true, agree: true, eSign: true, devSkip: true, mode },
        auditHash,
        quizAnswers: {
          mode,
          steps: allSteps,
          packOnly,
        } as Prisma.InputJsonValue,
        createdAt,
      },
    });

    revalidatePath('/rbt', 'layout');
    revalidatePath('/ats', 'layout');
    return {
      success: true as const,
      data: {
        candidateId,
        mode,
        stepsCompleted: allSteps.length,
        stage: nextStage,
      },
    };
  } catch (error) {
    console.error(
      'devSkipApplicantRequirements failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to skip requirements.' };
  }
}

/** Seed / demo staff that must never be wiped by Dev Tools delete. */
const PROTECTED_USER_IDS = new Set([
  'edbd9e0c-b8cb-4206-b297-ff81dc4ade88', // Eleanor Vance (Head HR)
  '6646e619-2a55-48c9-a208-2d6c1dfcdb0a', // Marcus Vance (HR Agent)
]);

const PROTECTED_USER_EMAILS = new Set([
  'david.m@riseandshine.nyc',
  'emily.t@riseandshine.nyc',
  'head.hr@riseandshine.com',
  'eleanor.vance@riseandshine.com',
  'marcus.v@riseandshine.nyc',
  'robert.s@riseandshine.com',
]);

export type DevAtsCandidateRow = {
  id: string;
  name: string;
  email: string;
  stage: string;
  activationStatus: string;
  userId: string | null;
  appliedDate: string;
  roleApplied: string;
};

/** Dev-only candidate list (no ATS staff auth — Dev Tools panel only). */
export async function devListAtsCandidates() {
  try {
    if (!assertDevToolsEnabled()) {
      return { success: false as const, error: 'Dev tools disabled', data: [] as DevAtsCandidateRow[] };
    }

    const rows = await prisma.atsCandidate.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        stage: true,
        activationStatus: true,
        userId: true,
        createdAt: true,
        appliedRole: true,
      },
    });

    const data: DevAtsCandidateRow[] = rows.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      stage: c.stage,
      activationStatus: c.activationStatus,
      userId: c.userId,
      appliedDate: c.createdAt.toISOString().split('T')[0],
      roleApplied: c.appliedRole || 'RBT',
    }));

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'devListAtsCandidates failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to list candidates.',
      data: [] as DevAtsCandidateRow[],
    };
  }
}

/**
 * Dev-only: delete an ATS applicant (and hire-created User if linked).
 * Protected seed staff (David Miller / Head HR / etc.) cannot be deleted.
 */
export async function devDeleteAtsCandidate(candidateId: string) {
  try {
    if (!assertDevToolsEnabled()) {
      return { success: false as const, error: 'Dev tools disabled' };
    }

    if (!candidateId || !UUID_RE.test(candidateId)) {
      return { success: false as const, error: 'Invalid candidate id.' };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        email: true,
        userId: true,
        firstName: true,
        lastName: true,
        stage: true,
      },
    });

    if (!candidate) {
      return { success: false as const, error: 'Candidate not found (already deleted?).' };
    }

    const linkedUserId = candidate.userId;
    let linkedUserEmail: string | null = null;
    if (linkedUserId) {
      const linked = await prisma.user.findUnique({
        where: { id: linkedUserId },
        select: { id: true, email: true },
      });
      linkedUserEmail = linked?.email?.toLowerCase() ?? null;

      if (
        PROTECTED_USER_IDS.has(linkedUserId) ||
        (linkedUserEmail && PROTECTED_USER_EMAILS.has(linkedUserEmail))
      ) {
        return {
          success: false as const,
          error: 'Protected seed staff cannot be deleted.',
        };
      }
    }

    // Clear device session cookie if we were impersonating this candidate
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
    if (sessionId === candidateId) {
      cookieStore.delete(SESSION_COOKIE);
      cookieStore.delete('ras_hrm_role');
    }

    // Candidate cascades packet / interviews / tickets / device sessions
    await prisma.atsCandidate.delete({ where: { id: candidateId } });

    // Hire creates a User — remove that copy so Active Users stays clean
    if (linkedUserId) {
      try {
        await prisma.user.delete({ where: { id: linkedUserId } });
      } catch (userErr) {
        console.error(
          'devDeleteAtsCandidate: linked user cleanup failed:',
          userErr instanceof Error ? userErr.message : 'Unknown'
        );
        // Candidate already gone — still success for the main goal
      }
    }

    revalidatePath('/ats');
    revalidatePath('/rbt', 'layout');
    return {
      success: true as const,
      data: {
        candidateId,
        name: `${candidate.firstName} ${candidate.lastName}`.trim(),
        deletedUserId: linkedUserId,
      },
    };
  } catch (error) {
    console.error(
      'devDeleteAtsCandidate failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to delete candidate.' };
  }
}

/**
 * DevTools — connected-product demo seed (Studio → sign → payroll).
 * Playbook: docs/superpowers/specs/2026-08-11-bridge-efg-manual-qa-checklist.md §Preconditions
 * Gate: assertDevToolsEnabled(). Idempotent via guardianEmail DEMO_STUDIO_GUARDIAN_EMAIL.
 * Prefer CRM DevTools for status ownership; HRM exposes the same seed so RBT Studio QA
 * can bootstrap without full intake.
 */

/** Stable marker — re-run upserts this client instead of creating duplicates. */
const DEMO_STUDIO_GUARDIAN_EMAIL = SHARED_DEMO_STUDIO_GUARDIAN_EMAIL;

/**
 * Demo fence (PHI safety): demo fixtures may only ever be written to the client
 * carrying the demo guardian-email marker. Throws before any seed write lands on
 * a real client (Client / PARequest / Session all key off clientId).
 */
async function assertDemoClientTarget(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<void> {
  const target = await tx.client.findUnique({
    where: { id: clientId },
    select: { guardianEmail: true },
  });
  if (
    !target ||
    (target.guardianEmail ?? '').toLowerCase() !== DEMO_STUDIO_GUARDIAN_EMAIL
  ) {
    throw new Error(
      `Demo fence: refusing to write demo fixtures to non-demo client ${clientId}.`
    );
  }
}

export type DevStudioSeedMode = SharedDevStudioSeedMode;
export type DevStudioSeedResult = SharedDevStudioSeedResult;

/**
 * Dev-only: upsert Demo Studio Learner to STAFFING_PENDING or ACTIVE with BCBA+RBT,
 * optionally a scheduled 97153 Session — skip full intake for Bridges E–G / Studio QA.
 */
export async function devSeedConnectedProductDemo(options?: {
  mode?: DevStudioSeedMode;
  /** Default true when mode=ACTIVE; false for STAFFING_PENDING unless set. */
  withSession?: boolean;
}) {
  try {
    if (!assertDevToolsEnabled()) {
      return { success: false as const, error: 'Dev tools disabled' };
    }

    const mode: DevStudioSeedMode = options?.mode === 'ACTIVE' ? 'ACTIVE' : 'STAFFING_PENDING';
    const withSession =
      options?.withSession !== undefined ? options.withSession : mode === 'ACTIVE';

    const data = await seedConnectedProductDemo(
      prisma,
      { mode, withSession },
      assertDemoClientTarget
    );

    revalidatePath('/', 'layout');
    revalidatePath('/rbt', 'layout');
    revalidatePath('/rbt/schedule');
    revalidatePath('/rbt/payroll');

    return { success: true as const, data };
  } catch (error) {
    const diagnostic = toDevSeedDiagnostic(error);
    console.error(
      `Action failed [devSeedConnectedProductDemo] code=${diagnostic.code ?? 'NONE'} message=${diagnostic.message}`
    );
    return { success: false as const, error: 'Failed to seed demo client.' };
  }
}

// ---------------------------------------------------------------------------
// QA status snapshot — read-only "state of the demo world" for the panel.
// Gate: assertDevToolsEnabled() (same devToolsGate as every action above).
// Mirrors CRM devTools.ts — one shared DB, so counts match across apps.
// ---------------------------------------------------------------------------

export type DevQaStatusSnapshot = {
  /** SessionNotes RBT-signed, awaiting BCBA co-sign. */
  unsignedNotes: number;
  /** BCBA-signed notes not yet marked sent to Plutus. */
  signedUnconverted: number;
  openCaseOpenings: number;
  /** PARequests still NOT_STARTED or SUBMITTED. */
  pendingPaRequests: number;
  /** Unread for current (possibly impersonated) user; null for mock roles. */
  myUnreadNotifications: number | null;
  /** Demo Studio Learner (guardian-email marker) — null until seeded. */
  demoClientId: string | null;
  /** Claim-ready fixture preferred for the existing Studio quick link. */
  demoSessionId: string | null;
  demoIncompleteSessionId: string | null;
  demoClaimReadySessionId: string | null;
};

/** Dev-only: live counts for the DevTools status readout. Read-only, no writes. */
export async function devGetQaStatusSnapshot() {
  try {
    if (!assertDevToolsEnabled()) {
      return { success: false as const, error: 'Dev tools disabled' };
    }

    const [
      unsignedNotes,
      signedUnconverted,
      openCaseOpenings,
      pendingPaRequests,
      demoClient,
      demoIncompleteSession,
      demoClaimReadySession,
    ] = await Promise.all([
      prisma.sessionNote.count({ where: { rbtSigned: true, bcbaSigned: false } }),
      prisma.sessionNote.count({ where: { bcbaSigned: true, isConverted: false } }),
      prisma.caseOpening.count({ where: { status: 'OPEN' } }),
      prisma.pARequest.count({ where: { status: { in: ['NOT_STARTED', 'SUBMITTED'] } } }),
      prisma.client.findFirst({
        where: { guardianEmail: DEMO_STUDIO_GUARDIAN_EMAIL },
        select: { id: true },
      }),
      prisma.session.findFirst({
        where: {
          id: { in: demoIncompleteSessionIds() },
          client: { guardianEmail: DEMO_STUDIO_GUARDIAN_EMAIL },
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
      prisma.session.findFirst({
        where: {
          id: { in: demoClaimReadySessionIds() },
          client: { guardianEmail: DEMO_STUDIO_GUARDIAN_EMAIL },
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
    ]);

    // Mock-role impersonation yields a non-UUID id — skip the count instead of
    // throwing on the uuid column cast.
    let myUnreadNotifications: number | null = null;
    const user = await getCurrentUser();
    if (user && UUID_RE.test(user.id)) {
      myUnreadNotifications = await prisma.notification.count({
        where: { userId: user.id, isRead: false },
      });
    }

    const data: DevQaStatusSnapshot = {
      unsignedNotes,
      signedUnconverted,
      openCaseOpenings,
      pendingPaRequests,
      myUnreadNotifications,
      demoClientId: demoClient?.id ?? null,
      demoSessionId: demoClaimReadySession?.id ?? demoIncompleteSession?.id ?? null,
      demoIncompleteSessionId: demoIncompleteSession?.id ?? null,
      demoClaimReadySessionId: demoClaimReadySession?.id ?? null,
    };

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'Action failed [devGetQaStatusSnapshot]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to load QA snapshot.' };
  }
}
