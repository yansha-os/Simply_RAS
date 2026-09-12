'use client';

import type { OnboardingProgressPatch } from '@/lib/atsStage';
import type { ActiveApplicantSession } from '@/app/actions/applicantSessionActions';
import {
  CACHE_KEYS,
  cachedFetch,
  getCached,
  invalidateCache,
  setCached,
} from '@/lib/clientDataCache';

const SESSION_ID_KEY = 'ras_session_candidate_id';
const SESSION_NAME_KEY = 'ras_session_applicant_name';
const SESSION_EMAIL_KEY = 'ras_session_applicant_email';

const PROGRESS_TTL_MS = 60_000;
const SESSION_TTL_MS = 90_000;
type ApplicantProgressPatch = Pick<
  OnboardingProgressPatch,
  'availabilityGrid' | 'preferredBoroughs' | 'transportation' | 'maxTravelMiles'
>;

/** Cache UI hints from a resolved / bound device session (not product SoT). */
export function cacheApplicantSessionClient(session: ActiveApplicantSession) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_ID_KEY, session.candidateId);
  sessionStorage.setItem(SESSION_NAME_KEY, session.name);
  sessionStorage.setItem(SESSION_EMAIL_KEY, session.email);
  setCached(CACHE_KEYS.applicantSession, session, SESSION_TTL_MS);
  window.dispatchEvent(new Event('ras_applicant_session_changed'));
}

export function clearApplicantSessionClient() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_ID_KEY);
  sessionStorage.removeItem(SESSION_NAME_KEY);
  sessionStorage.removeItem(SESSION_EMAIL_KEY);
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('ras_active_')) localStorage.removeItem(k);
  }
  invalidateCache('applicant:');
  window.dispatchEvent(new Event('ras_applicant_session_changed'));
}

/**
 * Resolve active applicant id: sessionStorage (from device session) → legacy localStorage.
 * Prefer calling `ensureActiveApplicantId()` on mount so the cookie session is hydrated.
 */
export function getActiveApplicantId(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem(SESSION_ID_KEY) ||
    localStorage.getItem('ras_active_impersonated_applicant_id') ||
    localStorage.getItem('ras_active_applicant_id') ||
    null
  );
}

export function getActiveApplicantName(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem(SESSION_NAME_KEY) ||
    localStorage.getItem('ras_active_impersonated_applicant_name') ||
    null
  );
}

export function getActiveApplicantEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem(SESSION_EMAIL_KEY) ||
    localStorage.getItem('ras_active_impersonated_applicant_email') ||
    null
  );
}

/**
 * Seed / Dev Tools "Active RBT" (e.g. David Miller): role RBT with no ATS device session.
 * Distinct from hired applicants who still have a candidate session id.
 */
export function isRoleOnlyActiveRbt(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('hrm_active_role') === 'RBT' && !getActiveApplicantId();
}

/**
 * Live staff surfaces (Schedule / Job Board / Payroll) unlock when:
 * - ATS stage is HIRED, OR
 * - UI role is Active RBT (hired promotion or DevTools Active User / Seed Studio)
 *
 * Critical: a leftover non-hired applicant device session must NOT keep the lock
 * when DevTools has switched chrome to RBT (isRoleOnlyActiveRbt would be false).
 * True applicants stay on APPLICANT role and remain locked until hire.
 */
export function isLiveStaffRbtUnlocked(stage?: string | null): boolean {
  if (stage === 'HIRED') return true;
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('hrm_active_role') === 'RBT';
}

/** Hydrate client cache from httpOnly device session cookies. */
export async function ensureActiveApplicantId(force = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    if (!force) {
      const hit = getCached<ActiveApplicantSession>(CACHE_KEYS.applicantSession);
      if (hit?.candidateId) {
        return hit.candidateId;
      }
    }

    const { resolveActiveApplicantSession } = await import(
      '@/app/actions/applicantSessionActions'
    );
    const res = await resolveActiveApplicantSession();
    if (res.success && res.data) {
      cacheApplicantSessionClient(res.data);
      return res.data.candidateId;
    }
  } catch (err) {
    console.warn('ensureActiveApplicantId failed', err);
  }

  return getActiveApplicantId();
}

/**
 * Persist applicant-owned availability data or request an evidence refresh.
 * Readiness flags are rejected by the server and derived from durable records.
 */
export async function syncAtsProgress(patch: ApplicantProgressPatch): Promise<boolean> {
  const candidateId = (await ensureActiveApplicantId()) || getActiveApplicantId();
  if (!candidateId || candidateId === 'c1') return false;

  try {
    const { updateCandidateProgress } = await import('@/app/actions/atsActions');
    const res = await updateCandidateProgress(candidateId, patch);
    if (!res.success) {
      console.warn('syncAtsProgress:', res.error);
      return false;
    }
    invalidateCache(CACHE_KEYS.applicantProgress(candidateId));
    invalidateCache(CACHE_KEYS.atsCandidates);
    window.dispatchEvent(new Event('rbt_progress_synced'));
    return true;
  } catch (err) {
    console.warn('syncAtsProgress failed', err);
    return false;
  }
}

/** Progress snapshot plus ATS hire status (`stage === 'HIRED'` unlocks staff tabs). */
export async function loadAtsProgress(force = false) {
  const candidateId = (await ensureActiveApplicantId()) || getActiveApplicantId();
  if (!candidateId || candidateId === 'c1') return null;

  try {
    return await cachedFetch(
      CACHE_KEYS.applicantProgress(candidateId),
      async () => {
        const { getOnboardingProgress } = await import('@/app/actions/atsActions');
        const res = await getOnboardingProgress(candidateId);
        if (!res.success || !res.data) {
          console.warn('loadAtsProgress:', res.error);
          return null;
        }
        return {
          ...res.data,
          stage: res.stage,
          activationStatus: res.activationStatus,
        };
      },
      { ttlMs: PROGRESS_TTL_MS, force }
    );
  } catch (err) {
    console.warn('loadAtsProgress failed', err);
    return null;
  }
}

/** Drop progress/session caches after hire, offer sign, or role switch. */
export function invalidateApplicantCaches(candidateId?: string | null) {
  if (candidateId) invalidateCache(CACHE_KEYS.applicantProgress(candidateId));
  invalidateCache(CACHE_KEYS.applicantSession);
  invalidateCache(CACHE_KEYS.atsCandidates);
  invalidateCache(CACHE_KEYS.helpTicketsActive);
}

/**
 * Flip client UI chrome after a durable HIRED stage is confirmed server-side.
 * Does NOT write role cookies — those must never grant staff access.
 */
export function promoteClientRoleToRbt() {
  if (typeof window === 'undefined') return;
  localStorage.setItem('hrm_active_role', 'RBT');
  window.dispatchEvent(new Event('hrm_role_changed'));
  window.dispatchEvent(new Event('rbt_clearance_changed'));
  window.dispatchEvent(new Event('rbt_progress_synced'));
}

/** Promote UI chrome only when AtsCandidate.stage is already HIRED. */
export async function ensureHiredAsRbtStaff(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const data = await loadAtsProgress(true);
    if (data?.stage !== 'HIRED') return false;

    const { promoteHiredSessionToRbt } = await import(
      '@/app/actions/applicantSessionActions'
    );
    const res = await promoteHiredSessionToRbt();
    if (res.success && res.data) {
      cacheApplicantSessionClient(res.data);
    }
    promoteClientRoleToRbt();
    return true;
  } catch (err) {
    console.warn('ensureHiredAsRbtStaff failed', err);
    return false;
  }
}
