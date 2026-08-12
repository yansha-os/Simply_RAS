/** Applicant onboarding magic-link expiry window (readiness gap 7). */
const MAGIC_LINK_TTL_DAYS = 30;

export function newMagicLinkExpiry(): Date {
  return new Date(Date.now() + MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
}
