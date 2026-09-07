import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import {
  CANDIDATE_SESSION_COOKIE,
  DEVICE_FINGERPRINT_COOKIE,
  resolveFingerprintValidCandidate,
} from '@/lib/candidateDeviceSession';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActingRbtContext = {
  rbtUserId: string | null;
  candidateId: string | null;
};

async function resolveDemoDavidRbtId(): Promise<string | null> {
  const byEmail = await prisma.user.findFirst({
    where: {
      role: 'RBT',
      isActive: true,
      OR: [
        { email: { equals: 'david.m@riseandshine.nyc', mode: 'insensitive' } },
        { email: { contains: 'david', mode: 'insensitive' } },
        { firstName: { equals: 'David', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  if (byEmail?.id) return byEmail.id;

  return (
    (
      await prisma.user.findFirst({
        where: { role: 'RBT', isActive: true },
        select: { id: true },
      })
    )?.id ?? null
  );
}

/**
 * Resolve the acting RBT User.id for Session.rbtId queries.
 * Order: fingerprint-valid hired device session → real auth → fenced demo identity.
 *
 * Non-hired applicant device sessions must NOT short-circuit with null rbtUserId when
 * DevTools is impersonating Active RBT / Seed Studio David — that left Schedule empty
 * and the client hire-lock stuck on leftover applicant progress.
 */
export async function resolveActingRbtContext(): Promise<ActingRbtContext> {
  const cookieStore = await cookies();
  const sessionCandidate = await resolveFingerprintValidCandidate(
    cookieStore.get(CANDIDATE_SESSION_COOKIE)?.value,
    cookieStore.get(DEVICE_FINGERPRINT_COOKIE)?.value
  );

  // A fingerprint-valid hired device session is authoritative for RBT identity.
  if (sessionCandidate?.stage === 'HIRED' && sessionCandidate.userId) {
    const activeRbt = await prisma.user.findFirst({
      where: {
        id: sessionCandidate.userId,
        role: 'RBT',
        isActive: true,
      },
      select: { id: true },
    });
    if (activeRbt) {
      return {
        candidateId: sessionCandidate.id,
        rbtUserId: activeRbt.id,
      };
    }
  }

  const user = await getCurrentUser();
  if (
    user?.id &&
    user.id !== 'mock-user-id' &&
    UUID_RE.test(user.id) &&
    user.role === 'RBT' &&
    user.isActive !== false
  ) {
    const linked = await prisma.atsCandidate.findFirst({
      where: { userId: user.id },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      rbtUserId: user.id,
      // Prefer User↔candidate link; ignore leftover non-hired applicant cookie
      candidateId: linked?.id ?? null,
    };
  }

  // Dev / role-only Active RBT (mock-user-id): prefer seeded David Miller.
  // Production must NEVER resolve a mock identity to a real RBT — fail auth instead.
  if (user?.role === 'RBT') {
    if (!isDevToolsEnabled()) {
      return { rbtUserId: null, candidateId: null };
    }
    const rbtUserId = await resolveDemoDavidRbtId();
    if (!rbtUserId) return { rbtUserId: null, candidateId: null };

    const linked = await prisma.atsCandidate.findFirst({
      where: { userId: rbtUserId },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    return { rbtUserId, candidateId: linked?.id ?? null };
  }

  // True applicant path: keep device-session candidate, no staff User yet
  if (sessionCandidate && sessionCandidate.stage !== 'HIRED') {
    return {
      candidateId: sessionCandidate.id,
      rbtUserId: null,
    };
  }

  return { rbtUserId: null, candidateId: null };
}

/**
 * Resolve the RBT User.id the caller may act as (gap 10 — no identity spoofing).
 *
 * - When the caller has their own RBT identity (hired device session / real RBT auth),
 *   that identity always wins; a mismatching explicit id resolves to null.
 * - An explicit id is only honored on its own for signed-in non-RBT staff
 *   (e.g. a manager viewing an RBT's payroll).
 */
export async function resolveActingRbtUserId(explicit?: string | null): Promise<string | null> {
  const ctx = await resolveActingRbtContext();
  const explicitValid = Boolean(explicit && UUID_RE.test(explicit));

  if (ctx.rbtUserId) {
    if (explicitValid && explicit !== ctx.rbtUserId) {
      // Caller tried to act as a different RBT — refuse rather than silently switch
      return null;
    }
    return ctx.rbtUserId;
  }

  if (explicitValid) {
    const user = await getCurrentUser();
    const isStaffViewer = Boolean(
      user && user.role !== 'RBT' && user.id !== 'mock-user-id' && UUID_RE.test(user.id)
    );
    const isDevMockStaff = Boolean(user && user.role !== 'RBT' && isDevToolsEnabled());
    if (isStaffViewer || isDevMockStaff) {
      const u = await prisma.user.findFirst({
        where: { id: explicit!, role: 'RBT', isActive: true },
        select: { id: true },
      });
      if (u) return u.id;
    }
  }

  return null;
}
