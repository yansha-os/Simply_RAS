import { prisma } from '@/lib/prisma';
import { canUseApplicantDeviceSession } from '@/lib/applicantAccessPolicy';

export const CANDIDATE_SESSION_COOKIE = 'ras_device_session_token';
export const DEVICE_FINGERPRINT_COOKIE = 'device_fingerprint';
export const CANDIDATE_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FingerprintValidCandidate = {
  id: string;
  userId: string | null;
  stage: string;
  activationStatus: string;
};

export function isCandidateDeviceSessionCurrent(
  session: { boundAt: Date; revokedAt: Date | null },
  now = Date.now()
): boolean {
  const boundAt = session.boundAt.getTime();
  return (
    session.revokedAt === null &&
    Number.isFinite(boundAt) &&
    boundAt <= now &&
    now - boundAt <= CANDIDATE_SESSION_MAX_AGE_MS
  );
}

/**
 * Candidate cookies are only hints. Identity is established by the live
 * ApplicantDeviceSession row for the exact candidate/fingerprint pair.
 */
export async function resolveFingerprintValidCandidate(
  candidateId: string | null | undefined,
  deviceFingerprint: string | null | undefined
): Promise<FingerprintValidCandidate | null> {
  if (
    !candidateId ||
    !UUID_RE.test(candidateId) ||
    !deviceFingerprint ||
    !UUID_RE.test(deviceFingerprint)
  ) {
    return null;
  }

  try {
    const session = await prisma.applicantDeviceSession.findUnique({
      where: {
        candidateId_deviceFingerprint: {
          candidateId,
          deviceFingerprint,
        },
      },
      select: {
        revokedAt: true,
        boundAt: true,
        candidate: {
          select: {
            id: true,
            userId: true,
            stage: true,
            activationStatus: true,
          },
        },
      },
    });

    if (
      !session ||
      !isCandidateDeviceSessionCurrent(session) ||
      !canUseApplicantDeviceSession(session.candidate)
    ) {
      return null;
    }

    return session.candidate;
  } catch (e) {
    console.warn('resolveFingerprintValidCandidate notice:', e);
    return null;
  }
}
