'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import { getCurrentUser } from '@/lib/auth';
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

/**
 * DevTools — connected-product demo seed (Studio → sign → payroll).
 * Playbook: docs/superpowers/specs/2026-08-11-bridge-efg-manual-qa-checklist.md §Preconditions
 * Gate: devToolsGate (NODE_ENV !== production && NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';
 * boot-time assertion makes a misconfigured prod build fail).
 * Idempotent via guardianEmail DEMO_STUDIO_GUARDIAN_EMAIL (upsert client + reuse open Session).
 */

function assertDevToolsEnabled() {
  return isDevToolsEnabled();
}

export async function setImpersonationCookie(userId: string | null, role: string | null = null) {
  if (!assertDevToolsEnabled()) {
    return { success: false, error: 'Dev tools disabled' };
  }

  const cookieStore = await cookies();

  // Production is rejected above; cookies stay non-Secure for local HTTPS-less dev.
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

/** Stable marker — re-run upserts this client instead of creating duplicates. */
const DEMO_STUDIO_GUARDIAN_EMAIL = SHARED_DEMO_STUDIO_GUARDIAN_EMAIL;

/**
 * Demo fence (PHI safety): demo fixtures may only ever be written to the client
 * carrying the demo guardian-email marker. Throws before any seed write lands on
 * a real client (Client / PARequest / IntakePacket / Session all key off clientId).
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
    revalidatePath(`/client/${data.clientId}`);
    revalidatePath('/portal-case-coord');
    revalidatePath('/case');
    if (data.magicLinkToken) {
      revalidatePath(`/magic-link/${data.magicLinkToken}`);
    }

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
// ---------------------------------------------------------------------------

const SNAPSHOT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (user && SNAPSHOT_UUID_RE.test(user.id)) {
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
