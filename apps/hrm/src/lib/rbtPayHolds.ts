/** Shared pay holds between Session Studio incomplete close and RBT Payroll. */

import {
  checklistPassedFromSnapshot as readChecklistPassed,
  evaluateAttestationState,
  type AttestationFailureCode,
} from '@repo/db/session-note-attestation';

export const RBT_PAY_HOLDS_KEY = 'ras_rbt_pay_holds';

export type RbtPayHold = {
  id: string;
  sessionId: string;
  clientName: string;
  severity: 'BLOCKING' | 'WARNING';
  title: string;
  detail: string;
  amountHeld: number;
  sessionRef: string;
  missingKeys: string[];
  createdAt: string;
};

export type SessionPayFlags = {
  hasNote: boolean;
  sessionStatus: unknown;
  parentSigned: unknown;
  parentSignedAt: unknown;
  parentSignerName: unknown;
  rbtSigned: unknown;
  rbtSignedAt: unknown;
  rbtSignerName: unknown;
  bcbaSigned: unknown;
  bcbaSignedAt: unknown;
  bcbaSignerName: unknown;
  isConverted: unknown;
  checklistSnapshot: unknown;
  openDeficiencyCount: unknown;
  billableUnits: unknown;
  submissionFingerprint: unknown;
};

/**
 * Bridge G: estimates may be displayed for unfinished work, but payable truth
 * requires the same complete durable attestation state as claims/auth usage.
 */
export function derivePayHoldFromFlags(flags: SessionPayFlags): {
  payable: boolean;
  holdReason: string | null;
  reasonCode: AttestationFailureCode | 'SESSION_NOTE_MISSING' | null;
  manualReviewRequired: boolean;
} {
  if (!flags.hasNote) {
    if (flags.sessionStatus === 'COMPLETED') {
      return {
        payable: false,
        holdReason: 'Missing session note — pay held',
        reasonCode: 'SESSION_NOTE_MISSING',
        manualReviewRequired: false,
      };
    }
    if (flags.sessionStatus === 'IN_PROGRESS') {
      return {
        payable: false,
        holdReason: 'Session in progress / incomplete — note not submitted',
        reasonCode: 'SESSION_NOTE_MISSING',
        manualReviewRequired: false,
      };
    }
    return {
      payable: false,
      holdReason: 'Session scheduled; note not submitted',
      reasonCode: 'SESSION_NOTE_MISSING',
      manualReviewRequired: false,
    };
  }

  const integrity = evaluateAttestationState(
    {
      sessionStatus: flags.sessionStatus,
      parentSigned: flags.parentSigned,
      parentSignedAt: flags.parentSignedAt,
      parentSignerName: flags.parentSignerName,
      rbtSigned: flags.rbtSigned,
      rbtSignedAt: flags.rbtSignedAt,
      rbtSignerName: flags.rbtSignerName,
      bcbaSigned: flags.bcbaSigned,
      bcbaSignedAt: flags.bcbaSignedAt,
      bcbaSignerName: flags.bcbaSignerName,
      checklistSnapshot: flags.checklistSnapshot,
      openDeficiencyCount: flags.openDeficiencyCount,
      billableUnits: flags.billableUnits,
      submissionFingerprint: flags.submissionFingerprint,
      isConverted: flags.isConverted,
    },
    'DURABLE',
  );
  if (integrity.ok) {
    return {
      payable: true,
      holdReason: null,
      reasonCode: null,
      manualReviewRequired: false,
    };
  }

  const holdReason: Partial<Record<AttestationFailureCode, string>> = {
    SESSION_NOT_COMPLETED: 'Session is not completed — pay held',
    PARENT_ATTESTATION_MISSING: 'Caregiver/parent signature incomplete — pay held',
    PARENT_SIGNER_METADATA_INCOMPLETE:
      'Caregiver/parent signer metadata requires manual review — pay held',
    RBT_ATTESTATION_MISSING: 'RBT signature incomplete — pay held',
    RBT_SIGNER_METADATA_INCOMPLETE:
      'RBT signer metadata requires manual review — pay held',
    BCBA_ATTESTATION_MISSING: 'Awaiting BCBA e-sign — pay held',
    BCBA_SIGNER_METADATA_INCOMPLETE:
      'BCBA signer metadata requires manual review — pay held',
    CHECKLIST_FAILED: 'Billing checklist failed — pay held',
    CHECKLIST_MISSING: 'Billing checklist missing — manual review required',
    CHECKLIST_MALFORMED: 'Billing checklist malformed — manual review required',
    CHECKLIST_INCONSISTENT: 'Billing checklist inconsistent — manual review required',
    OPEN_DEFICIENCY: 'Open note deficiency — pay held',
    BILLABLE_UNITS_MISSING: 'Durable note units missing — estimate only, pay held',
    BILLABLE_UNITS_MALFORMED: 'Durable note units malformed — manual review required',
    BILLABLE_UNITS_NON_POSITIVE: 'Positive durable note units required — pay held',
    SUBMISSION_FINGERPRINT_MISSING:
      'Studio submission fingerprint missing — manual review required',
    SUBMISSION_FINGERPRINT_MALFORMED:
      'Studio submission fingerprint malformed — manual review required',
  };
  return {
    payable: false,
    holdReason: holdReason[integrity.code] || `${integrity.reason} Pay held.`,
    reasonCode: integrity.code,
    manualReviewRequired: integrity.manualReviewRequired,
  };
}

/**
 * 15-min units estimated from a session window (payroll fallback only).
 * Floor is 0 — a zero/near-zero-duration session must not pay a minimum unit
 * (audit M7: 3-minute sessions were paying ¼ hr once signed).
 */
export function estimateUnitsFromWindow(startMs: number, endMs: number): number {
  const mins = Math.max(0, (endMs - startMs) / 60000);
  return Math.floor(mins / 15);
}

export type PayrollUnitsSource = 'NOTE' | 'ESTIMATE';

/**
 * Slice 7 — prefer the durable units frozen on the SessionNote at claim-ready
 * submit; fall back to the scheduled/actual-duration estimate only when the
 * note has no persisted units.
 */
export function resolvePayrollUnits(
  noteUnits: number | null | undefined,
  fallbackUnits: number
): { units: number; source: PayrollUnitsSource } {
  if (typeof noteUnits === 'number' && Number.isFinite(noteUnits) && noteUnits > 0) {
    return { units: Math.floor(noteUnits), source: 'NOTE' };
  }
  return { units: fallbackUnits, source: 'ESTIMATE' };
}

/** Read checklist pass/fail from a SessionNote.checklistSnapshot JSON blob. */
export function checklistPassedFromSnapshot(snapshot: unknown): boolean | null {
  return readChecklistPassed(snapshot);
}

export function loadRbtPayHolds(): RbtPayHold[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RBT_PAY_HOLDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRbtPayHolds(holds: RbtPayHold[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RBT_PAY_HOLDS_KEY, JSON.stringify(holds));
  window.dispatchEvent(new Event('ras_rbt_pay_holds_changed'));
}

export function upsertRbtPayHold(hold: RbtPayHold) {
  const next = [hold, ...loadRbtPayHolds().filter((h) => h.sessionId !== hold.sessionId)];
  saveRbtPayHolds(next);
}

export function clearRbtPayHold(sessionId: string) {
  saveRbtPayHolds(loadRbtPayHolds().filter((h) => h.sessionId !== sessionId));
}

/** Drop local Incomplete holds once DB marks the session payable (Bridge G SoT). */
export function reconcileRbtPayHoldsAgainstPayable(payableSessionIds: string[]) {
  if (typeof window === 'undefined' || payableSessionIds.length === 0) return;
  const payable = new Set(payableSessionIds);
  const current = loadRbtPayHolds();
  const next = current.filter((h) => !payable.has(h.sessionId));
  if (next.length !== current.length) {
    saveRbtPayHolds(next);
  }
}
