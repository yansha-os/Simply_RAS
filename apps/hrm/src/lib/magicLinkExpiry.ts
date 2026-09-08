/** Applicant onboarding magic-link expiry window (readiness gap 7). */
const MAGIC_LINK_TTL_DAYS = 30;

export function newMagicLinkExpiry(): Date {
  return new Date(Date.now() + MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function isMagicLinkExpiryCurrent(
  expiresAt: Date | null,
  now = Date.now()
): boolean {
  if (!expiresAt) return false;
  const expiryTime = expiresAt.getTime();
  return Number.isFinite(expiryTime) && expiryTime > now;
}
