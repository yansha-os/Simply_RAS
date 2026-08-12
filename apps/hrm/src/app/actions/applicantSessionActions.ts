'use server';

import { prisma } from '@/lib/prisma';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth-guard';
import type { Role } from '@repo/db';
import {
  canBindApplicantPortal,
  canUseApplicantDeviceSession,
} from '@/lib/applicantAccessPolicy';

const ATS_STAFF_ROLES = [
  'HEAD_HR',
  'HR',
  'HR_AGENT',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COOKIE = 'ras_device_session_token';
const FINGERPRINT_COOKIE = 'device_fingerprint';
const ROLE_COOKIE = 'ras_hrm_role';
const SESSION_DAYS = 30;

export type ActiveApplicantSession = {
  candidateId: string;
  name: string;
  email: string;
  magicLinkToken: string | null;
  /** ATS stage — when HIRED, UI role is RBT staff (not applicant). */
  stage?: string;
  isHired?: boolean;
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

async function ensureFingerprint(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(FINGERPRINT_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;

  const headerStore = await headers();
  const fromHeader = headerStore.get('x-device-fingerprint');
  if (fromHeader && UUID_RE.test(fromHeader)) {
    cookieStore.set(FINGERPRINT_COOKIE, fromHeader, cookieOpts(60 * 60 * 24 * 365));
    return fromHeader;
  }

  const fingerprint = crypto.randomUUID();
  cookieStore.set(FINGERPRINT_COOKIE, fingerprint, cookieOpts(60 * 60 * 24 * 365));
  return fingerprint;
}

async function setSessionCookies(
  candidateId: string,
  uiRole: 'APPLICANT' | 'RBT' = 'APPLICANT'
) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, candidateId, cookieOpts(60 * 60 * 24 * SESSION_DAYS));
  cookieStore.set(ROLE_COOKIE, uiRole, cookieOpts(60 * 60 * 24 * SESSION_DAYS));
}

/** After wage-sign / hire: flip device session UI role from applicant → RBT staff. */
export async function promoteHiredSessionToRbt() {
  try {
    const cookieStore = await cookies();
    const candidateId = cookieStore.get(SESSION_COOKIE)?.value || null;
    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'No active session.' };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        stage: true,
      },
    });

    if (!candidate || candidate.stage !== 'HIRED') {
      return { success: false as const, error: 'Not hired yet.' };
    }

    await setSessionCookies(candidate.id, 'RBT');

    const data: ActiveApplicantSession = {
      candidateId: candidate.id,
      name: `${candidate.firstName} ${candidate.lastName}`.trim(),
      email: candidate.email,
      magicLinkToken: null,
      stage: 'HIRED',
      isHired: true,
    };

    revalidatePath('/rbt', 'layout');
    return { success: true as const, data };
  } catch (error) {
    console.error(
      'promoteHiredSessionToRbt failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to promote session.' };
  }
}

async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ROLE_COOKIE);
}

/**
 * Bind magic-link token to this device (httpOnly fingerprint cookie).
 * Creates/updates ApplicantDeviceSession and marks invite accepted.
 */
export async function bindMagicLinkSession(magicLinkToken: string) {
  try {
    if (!magicLinkToken || magicLinkToken.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(magicLinkToken)) {
      return { success: false as const, error: 'Invalid magic link.' };
    }

    const packet = await prisma.candidateOnboardingPacket.findUnique({
      where: { magicLinkToken },
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            activationStatus: true,
            stage: true,
          },
        },
      },
    });

    if (!packet?.candidate) {
      return { success: false as const, error: 'Magic link not found or expired.' };
    }

    // Gap 7: expiry / revocation enforcement.
    if (packet.magicLinkRevokedAt) {
      return { success: false as const, error: 'This link has been revoked. Ask HR for a new invite link.' };
    }
    if (packet.magicLinkExpiresAt && packet.magicLinkExpiresAt.getTime() < Date.now()) {
      return { success: false as const, error: 'This link has expired. Ask HR for a new invite link.' };
    }

    if (!canBindApplicantPortal(packet.candidate)) {
      return {
        success: false as const,
        error: 'Applicant portal access is pending an active HR invitation.',
      };
    }

    const fingerprint = await ensureFingerprint();
    const headerStore = await headers();
    const userAgent = headerStore.get('user-agent')?.slice(0, 500) || null;
    const ipAddress =
      headerStore.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) || null;

    const now = new Date();

    const bound = await prisma.$transaction(
      async (tx) => {
        const livePacket = await tx.candidateOnboardingPacket.findUnique({
          where: { magicLinkToken },
          include: {
            candidate: {
              select: {
                id: true,
                activationStatus: true,
                stage: true,
              },
            },
          },
        });
        if (
          !livePacket?.candidate ||
          livePacket.magicLinkRevokedAt ||
          (livePacket.magicLinkExpiresAt &&
            livePacket.magicLinkExpiresAt.getTime() < Date.now()) ||
          !canBindApplicantPortal(livePacket.candidate)
        ) {
          return false;
        }

        await tx.applicantDeviceSession.upsert({
          where: {
            candidateId_deviceFingerprint: {
              candidateId: livePacket.candidateId,
              deviceFingerprint: fingerprint,
            },
          },
          create: {
            candidateId: livePacket.candidateId,
            deviceFingerprint: fingerprint,
            magicLinkToken,
            userAgent,
            ipAddress,
            boundAt: now,
            lastSeenAt: now,
          },
          update: {
            magicLinkToken,
            userAgent,
            ipAddress,
            lastSeenAt: now,
            revokedAt: null,
          },
        });

        await tx.candidateOnboardingPacket.update({
          where: { id: livePacket.id },
          data: {
            deviceFingerprint: fingerprint,
            deviceBoundAt: livePacket.deviceBoundAt ?? now,
            inviteAcceptedAt: livePacket.inviteAcceptedAt ?? now,
          },
        });

        if (livePacket.candidate.activationStatus === 'INVITATION_SENT') {
          await tx.atsCandidate.update({
            where: { id: livePacket.candidateId },
            data: { activationStatus: 'ACTIVE' },
          });
        }

        return true;
      },
      { isolationLevel: 'Serializable' }
    );
    if (!bound) {
      return {
        success: false as const,
        error: 'This invitation is no longer active. Ask HR for a new invite link.',
      };
    }

    const hired = packet.candidate.stage === 'HIRED';

    await setSessionCookies(packet.candidateId, hired ? 'RBT' : 'APPLICANT');

    revalidatePath('/rbt', 'layout');
    
    const data: ActiveApplicantSession = {
      candidateId: packet.candidate.id,
      name: `${packet.candidate.firstName} ${packet.candidate.lastName}`.trim(),
      email: packet.candidate.email,
      magicLinkToken,
      stage: packet.candidate.stage,
      isHired: hired,
    };

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'bindMagicLinkSession failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to open applicant session.' };
  }
}

/** Resolve durable applicant session from cookies + ApplicantDeviceSession. */
export async function resolveActiveApplicantSession() {
  try {
    const cookieStore = await cookies();
    const candidateId = cookieStore.get(SESSION_COOKIE)?.value || null;
    const fingerprint = cookieStore.get(FINGERPRINT_COOKIE)?.value || null;

    if (!isUuid(candidateId) || !fingerprint || !UUID_RE.test(fingerprint)) {
      return { success: true as const, data: null };
    }

    const session = await prisma.applicantDeviceSession.findUnique({
      where: {
        candidateId_deviceFingerprint: {
          candidateId,
          deviceFingerprint: fingerprint,
        },
      },
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            stage: true,
            activationStatus: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      !canUseApplicantDeviceSession(session.candidate)
    ) {
      await clearSessionCookies();
      return { success: true as const, data: null };
    }

    await prisma.applicantDeviceSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    const hired = session.candidate.stage === 'HIRED';
    // Keep UI role cookie in sync (applicant → RBT after hire)
    await setSessionCookies(session.candidate.id, hired ? 'RBT' : 'APPLICANT');

    const data: ActiveApplicantSession = {
      candidateId: session.candidate.id,
      name: `${session.candidate.firstName} ${session.candidate.lastName}`.trim(),
      email: session.candidate.email,
      magicLinkToken: session.magicLinkToken,
      stage: session.candidate.stage,
      isHired: hired,
    };

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'resolveActiveApplicantSession failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to resolve session.', data: null };
  }
}

/**
 * Dev Tools: bind current device as this applicant (creates session row).
 * Still requires NEXT_PUBLIC_ENABLE_DEV_TOOLS and non-production.
 */
export async function devImpersonateApplicantSession(candidateId: string) {
  try {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== 'true'
    ) {
      return { success: false as const, error: 'Dev tools disabled' };
    }

    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate id.' };
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      include: { onboardingPacket: { select: { id: true, magicLinkToken: true } } },
    });
    if (!candidate) {
      return { success: false as const, error: 'Candidate not found.' };
    }
    if (!canBindApplicantPortal(candidate)) {
      return {
        success: false as const,
        error: 'Applicant portal access requires an active HR invitation.',
      };
    }

    let token = candidate.onboardingPacket?.magicLinkToken;
    if (!candidate.onboardingPacket) {
      token = crypto.randomUUID();
      await prisma.candidateOnboardingPacket.create({
        data: {
          candidateId,
          magicLinkToken: token,
          formData: {},
        },
      });
    } else if (!token) {
      token = crypto.randomUUID();
      await prisma.candidateOnboardingPacket.update({
        where: { candidateId },
        data: { magicLinkToken: token },
      });
    }

    const fingerprint = await ensureFingerprint();
    const now = new Date();

    await prisma.applicantDeviceSession.upsert({
      where: {
        candidateId_deviceFingerprint: {
          candidateId,
          deviceFingerprint: fingerprint,
        },
      },
      create: {
        candidateId,
        deviceFingerprint: fingerprint,
        magicLinkToken: token!,
        boundAt: now,
        lastSeenAt: now,
      },
      update: {
        magicLinkToken: token!,
        lastSeenAt: now,
        revokedAt: null,
      },
    });

    await setSessionCookies(candidateId, candidate.stage === 'HIRED' ? 'RBT' : 'APPLICANT');

    const data: ActiveApplicantSession = {
      candidateId: candidate.id,
      name: `${candidate.firstName} ${candidate.lastName}`.trim(),
      email: candidate.email,
      magicLinkToken: token || null,
      stage: candidate.stage,
      isHired: candidate.stage === 'HIRED',
    };

    revalidatePath('/rbt', 'layout');
    return { success: true as const, data };
  } catch (error) {
    console.error(
      'devImpersonateApplicantSession failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to impersonate applicant.' };
  }
}

export async function clearApplicantDeviceSession() {
  try {
    const cookieStore = await cookies();
    const candidateId = cookieStore.get(SESSION_COOKIE)?.value || null;
    const fingerprint = cookieStore.get(FINGERPRINT_COOKIE)?.value || null;

    if (isUuid(candidateId) && fingerprint && UUID_RE.test(fingerprint)) {
      await prisma.applicantDeviceSession.updateMany({
        where: {
          candidateId,
          deviceFingerprint: fingerprint,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    await clearSessionCookies();
    revalidatePath('/rbt', 'layout');
    return { success: true as const };
  } catch (error) {
    console.error(
      'clearApplicantDeviceSession failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to clear session.' };
  }
}

/** Staff: revoke all devices for a candidate (lost phone / HR reset). */
export async function revokeCandidateDeviceSessions(candidateId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    if (!isUuid(candidateId)) {
      return { success: false as const, error: 'Invalid candidate id.' };
    }

    await prisma.applicantDeviceSession.updateMany({
      where: { candidateId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    revalidatePath(`/ats/applicant/${candidateId}`);
    return { success: true as const };
  } catch (error) {
    console.error(
      'revokeCandidateDeviceSessions failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, error: 'Failed to revoke sessions.' };
  }
}
