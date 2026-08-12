/**
 * Auth unit balances — read model over Authorization / AuthCptCode / PARequest / Session + SessionNote.
 * No schema changes. Used units = sum of SessionNote.billableUnits for notes that are
 * satisfy the durable attestation chain within the auth window (claim-grade DB math).
 */

import {
  evaluateAttestationState,
  type SessionNoteAttestationInput,
} from '@repo/db/session-note-attestation';

import {
  clinicDateKey,
} from '@/lib/clinicTimezone';

export type AuthWindowSource = 'AUTHORIZATION' | 'PA_REQUEST';
export type CptUnitAttribution =
  | 'EXACT_CPT'
  | 'UNATTRIBUTED_AGGREGATE'
  | 'NO_EXACT_CPT'
  | 'AMBIGUOUS_EXACT_CPT'
  | 'AUTH_TYPE_MISMATCH'
  | 'UNREVIEWED_CPT';

export type CptUnitLine = {
  cptCode: string;
  unitsAuthorized: number | null;
  unitsUsed: number | null;
  unitsRemaining: number | null;
  /** Only EXACT_CPT lines may participate in automatic utilization/hard-stop math. */
  attribution: CptUnitAttribution;
  /** True when staff must review CPT attribution before relying on this line. */
  manualReviewRequired: boolean;
  /** True when authorized units exist but no durable note can be attributed */
  usageTrackingLater: boolean;
  /** Sessions in window that satisfy durable attestation integrity */
  sessionCount: number;
  /** Subset with bcbaSigned */
  signedSessionCount: number;
  /** Subset with isConverted */
  convertedSessionCount: number;
  /** Apparently finalized notes missing durable billableUnits */
  missingBillableUnitsCount: number;
  /** Apparently finalized notes excluded for malformed attestation state */
  integrityReviewCount: number;
};

export type AuthUnitWindow = {
  id: string;
  source: AuthWindowSource;
  type: 'ASSESSMENT' | 'TREATMENT' | string;
  status: string;
  authNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Aggregate approved units when CPT lines are absent (PARequest path) */
  aggregateUnitsApproved: number | null;
  lines: CptUnitLine[];
  windowActive: boolean;
  windowExpired: boolean;
};

export type ClientAuthUnitBalances = {
  clientId: string;
  windows: AuthUnitWindow[];
  usageMethod: 'NOTE_BILLABLE_UNITS' | 'AUTHORIZED_ONLY';
  usageNote: string;
};

export type AuthCptRow = { code: string; unitsApproved: number | null };
export type AuthorizationRow = {
  id: string;
  type: string;
  status: string;
  authNumber: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  unitsApproved: number | null;
  cptCodes: AuthCptRow[];
};
export type PaRequestRow = {
  id: string;
  type: string;
  status: string;
  authNumber: string | null;
  approvedUnits: number | null;
  effectiveDate: Date | string | null;
  expirationDate: Date | string | null;
};

/** SessionNote is 1:1 on Session — access as session.note, never [0] */
export type SessionNoteUtilization = Omit<
  SessionNoteAttestationInput,
  'sessionStatus'
> & {
  isConverted: boolean;
};

export type SessionWithNoteRow = {
  id: string;
  status: string;
  cptCode: string | null;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  actualStart: Date | string | null;
  actualEnd: Date | string | null;
  note: SessionNoteUtilization | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const AUTH_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T.+)?$/;

function validCalendarDateKey(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Authorization boundaries are clinic calendar dates, not instants.
 * Prisma Date values use their UTC Y-M-D storage fields; serialized values use
 * the literal leading Y-M-D so host timezone and DST never shift the boundary.
 */
function authDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return validCalendarDateKey(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  const raw = value.trim();
  const match = AUTH_DATE_RE.exec(raw);
  if (!match) return null;
  if (raw.includes('T') && Number.isNaN(Date.parse(raw))) return null;
  return validCalendarDateKey(Number(match[1]), Number(match[2]), Number(match[3]));
}

function authDateIso(value: Date | string | null | undefined): string | null {
  const key = authDateKey(value);
  return key ? `${key}T00:00:00.000Z` : null;
}

type ClosedAuthWindow = {
  startKey: string;
  endKey: string;
};

function closedAuthWindow(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): ClosedAuthWindow | null {
  const startKey = authDateKey(start);
  const endKey = authDateKey(end);
  if (!startKey || !endKey || startKey > endKey) return null;
  return { startKey, endKey };
}

function sessionServiceDate(session: SessionWithNoteRow): Date | null {
  return toDate(session.actualStart) ?? toDate(session.scheduledStart);
}

/**
 * Inclusive closed date-only auth window using clinic calendar-date semantics.
 */
function inWindow(
  date: Date | null,
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): boolean {
  const window = closedAuthWindow(start, end);
  if (!date || !window) return false;
  const serviceKey = clinicDateKey(date);
  return serviceKey >= window.startKey && serviceKey <= window.endKey;
}

/** Utilization gate: the full durable attestation chain (Bridge F/G). */
export function noteCountsTowardAuthUnits(
  note: SessionNoteUtilization | null | undefined,
  sessionStatus = 'COMPLETED',
): boolean {
  if (!note) return false;
  return evaluateAttestationState(
    {
      sessionStatus,
      ...note,
    },
    'DURABLE',
  ).ok;
}

/**
 * Sessions that burn auth units: not cancelled/no-show, and note is
 * complete durable attestation integrity. Units come from SessionNote.billableUnits.
 */
export function isAuthUtilizingSession(session: SessionWithNoteRow): boolean {
  if (session.status === 'CANCELLED' || session.status === 'NO_SHOW') return false;
  return noteCountsTowardAuthUnits(session.note, session.status);
}

export function sessionNoteBillableUnits(session: SessionWithNoteRow): number {
  const raw = session.note?.billableUnits;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

/** Active/expired flags for a date-only window, using clinic-TZ day boundaries. */
function windowFlags(
  status: string,
  start: Date | string | null,
  end: Date | string | null,
  now: Date,
): { windowActive: boolean; windowExpired: boolean } {
  const window = closedAuthWindow(start, end);
  const todayKey = clinicDateKey(now);
  return {
    windowActive: Boolean(
      status === 'APPROVED' &&
        window &&
        window.startKey <= todayKey &&
        todayKey <= window.endKey,
    ),
    windowExpired: Boolean(window && window.endKey < todayKey),
  };
}

const REVIEWED_CPT_AUTH_TYPES: Readonly<Record<string, 'ASSESSMENT' | 'TREATMENT'>> = {
  '97151': 'ASSESSMENT',
  '97153': 'TREATMENT',
  '97154': 'TREATMENT',
  '97155': 'TREATMENT',
  '97156': 'TREATMENT',
  '97157': 'TREATMENT',
  '97158': 'TREATMENT',
};

function normalizeCptCode(value: string | null | undefined): string {
  return (value || '').trim();
}

function reviewedAuthTypeForCpt(cptCode: string): 'ASSESSMENT' | 'TREATMENT' | null {
  return REVIEWED_CPT_AUTH_TYPES[cptCode] ?? null;
}

function summarizeSessions(sessions: SessionWithNoteRow[]): {
  unitsUsed: number;
  sessionCount: number;
  signedSessionCount: number;
  convertedSessionCount: number;
  missingBillableUnitsCount: number;
  integrityReviewCount: number;
} {
  let unitsUsed = 0;
  let signedSessionCount = 0;
  let convertedSessionCount = 0;
  let missingBillableUnitsCount = 0;
  let integrityReviewCount = 0;

  for (const s of sessions) {
    const note = s.note;
    if (!note) continue;
    const attestation = evaluateAttestationState(
      {
        sessionStatus: s.status,
        ...note,
      },
      'DURABLE',
    );
    if (!attestation.ok) {
      if (note.bcbaSigned || note.isConverted || attestation.manualReviewRequired) {
        integrityReviewCount += 1;
        if (typeof note.billableUnits !== 'number') {
          missingBillableUnitsCount += 1;
        }
      }
      continue;
    }
    if (note.bcbaSigned) signedSessionCount += 1;
    if (note.isConverted) convertedSessionCount += 1;
    unitsUsed += sessionNoteBillableUnits(s);
  }

  return {
    unitsUsed,
    sessionCount: signedSessionCount,
    signedSessionCount,
    convertedSessionCount,
    missingBillableUnitsCount,
    integrityReviewCount,
  };
}

function buildLinesFromCptCodes(
  authType: string,
  cptCodes: AuthCptRow[],
  sessionsInWindow: SessionWithNoteRow[],
): CptUnitLine[] {
  return cptCodes.map((cpt) => {
    const code = normalizeCptCode(cpt.code);
    const reviewedType = reviewedAuthTypeForCpt(code);
    const attribution: CptUnitAttribution =
      reviewedType == null
        ? 'UNREVIEWED_CPT'
        : reviewedType !== authType
          ? 'AUTH_TYPE_MISMATCH'
          : 'EXACT_CPT';
    const canAttribute = attribution === 'EXACT_CPT';
    const matching = canAttribute
      ? sessionsInWindow.filter((s) => normalizeCptCode(s.cptCode) === code)
      : [];
    const stats = summarizeSessions(matching);
    const authorized = cpt.unitsApproved ?? null;
    const hasUsageSignal = stats.sessionCount > 0;

    return {
      cptCode: code || '—',
      unitsAuthorized: authorized,
      unitsUsed: canAttribute
        ? hasUsageSignal
          ? stats.unitsUsed
          : authorized != null
            ? 0
            : null
        : null,
      unitsRemaining:
        canAttribute && authorized != null ? Math.max(0, authorized - stats.unitsUsed) : null,
      attribution,
      manualReviewRequired: !canAttribute || stats.integrityReviewCount > 0,
      usageTrackingLater: !canAttribute,
      sessionCount: stats.sessionCount,
      signedSessionCount: stats.signedSessionCount,
      convertedSessionCount: stats.convertedSessionCount,
      missingBillableUnitsCount: stats.missingBillableUnitsCount,
      integrityReviewCount: stats.integrityReviewCount,
    };
  });
}

function buildAggregateLine(
  approvedUnits: number | null,
): CptUnitLine {
  return {
    cptCode: 'UNATTRIBUTED',
    unitsAuthorized: approvedUnits,
    unitsUsed: null,
    unitsRemaining: null,
    attribution: 'UNATTRIBUTED_AGGREGATE',
    manualReviewRequired: true,
    usageTrackingLater: true,
    sessionCount: 0,
    signedSessionCount: 0,
    convertedSessionCount: 0,
    missingBillableUnitsCount: 0,
    integrityReviewCount: 0,
  };
}

function emptyPendingLine(): CptUnitLine {
  return {
    cptCode: 'UNATTRIBUTED',
    unitsAuthorized: null,
    unitsUsed: null,
    unitsRemaining: null,
    attribution: 'UNATTRIBUTED_AGGREGATE',
    manualReviewRequired: true,
    usageTrackingLater: true,
    sessionCount: 0,
    signedSessionCount: 0,
    convertedSessionCount: 0,
    missingBillableUnitsCount: 0,
    integrityReviewCount: 0,
  };
}

export function computeClientAuthUnitBalances(input: {
  clientId: string;
  authorizations: AuthorizationRow[];
  paRequests: PaRequestRow[];
  sessions: SessionWithNoteRow[];
}): ClientAuthUnitBalances {
  const now = new Date();
  const windows: AuthUnitWindow[] = [];
  const nonCancelledSessions = input.sessions.filter(
    (session) =>
      session.status !== 'CANCELLED' &&
      session.status !== 'NO_SHOW' &&
      session.note != null,
  );
  const utilizingSessions = input.sessions.filter(isAuthUtilizingSession);

  // 1) Authorization rows with explicit AuthCptCode lines.
  // Every cycle remains visible; hard-stop selection ranks eligible cycles separately.
  for (const auth of input.authorizations) {
    const hasCptLines = (auth.cptCodes?.length ?? 0) > 0;
    if (!hasCptLines) continue;

    const inAuthWindow =
      auth.status === 'APPROVED'
        ? nonCancelledSessions.filter((s) =>
            inWindow(sessionServiceDate(s), auth.startDate, auth.endDate),
          )
        : [];

    windows.push({
      id: auth.id,
      source: 'AUTHORIZATION',
      type: auth.type,
      status: auth.status,
      authNumber: auth.authNumber,
      startDate: authDateIso(auth.startDate),
      endDate: authDateIso(auth.endDate),
      aggregateUnitsApproved: auth.unitsApproved,
      lines: buildLinesFromCptCodes(auth.type, auth.cptCodes, inAuthWindow),
      ...windowFlags(auth.status, auth.startDate, auth.endDate, now),
    });
  }

  // 2) PARequest = live Plutus tracker. Its approvedUnits field is aggregate,
  // so it is displayed as unattributed and never consumes a Session CPT.
  for (const pa of input.paRequests) {
    const lines: CptUnitLine[] =
      pa.status === 'APPROVED' || pa.approvedUnits != null
        ? [buildAggregateLine(pa.approvedUnits)]
        : [emptyPendingLine()];

    windows.push({
      id: pa.id,
      source: 'PA_REQUEST',
      type: pa.type,
      status: pa.status,
      authNumber: pa.authNumber,
      startDate: authDateIso(pa.effectiveDate),
      endDate: authDateIso(pa.expirationDate),
      aggregateUnitsApproved: pa.approvedUnits,
      lines,
      ...windowFlags(pa.status, pa.effectiveDate, pa.expirationDate, now),
    });
  }

  // 3) Authorization shells without explicit CPT attribution.
  for (const auth of input.authorizations) {
    if ((auth.cptCodes?.length ?? 0) > 0) continue;

    const lines =
      auth.unitsApproved != null || auth.status === 'APPROVED'
        ? [buildAggregateLine(auth.unitsApproved)]
        : [emptyPendingLine()];

    windows.push({
      id: auth.id,
      source: 'AUTHORIZATION',
      type: auth.type,
      status: auth.status,
      authNumber: auth.authNumber,
      startDate: authDateIso(auth.startDate),
      endDate: authDateIso(auth.endDate),
      aggregateUnitsApproved: auth.unitsApproved,
      lines,
      ...windowFlags(auth.status, auth.startDate, auth.endDate, now),
    });
  }

  windows.sort((a, b) => {
    const byStart = (b.startDate ?? '').localeCompare(a.startDate ?? '');
    if (byStart !== 0) return byStart;
    const byEnd = (b.endDate ?? '').localeCompare(a.endDate ?? '');
    if (byEnd !== 0) return byEnd;
    const bySource =
      (a.source === 'AUTHORIZATION' ? 0 : 1) - (b.source === 'AUTHORIZATION' ? 0 : 1);
    if (bySource !== 0) return bySource;
    return a.id.localeCompare(b.id);
  });

  const anyUtilizing = utilizingSessions.length > 0;
  const anyApproved = windows.some((w) =>
    w.lines.some((l) => l.unitsAuthorized != null),
  );
  const anyExactTrackedUsage = windows.some(
    (window) =>
      window.status === 'APPROVED' &&
      window.lines.some(
        (line) =>
          line.attribution === 'EXACT_CPT' &&
          line.unitsAuthorized != null &&
          line.sessionCount > 0,
      ),
  );
  const missingUnits = windows.reduce(
    (count, window) =>
      count +
      window.lines.reduce(
        (lineCount, line) => lineCount + line.missingBillableUnitsCount,
        0,
      ),
    0,
  );
  const integrityReviewCount = windows.reduce(
    (count, window) =>
      count +
      window.lines.reduce(
        (lineCount, line) => lineCount + line.integrityReviewCount,
        0,
      ),
    0,
  );

  let usageNote =
    'Used units sum positive durable SessionNote.billableUnits only when the Session is completed and parent, RBT, BCBA, checklist, fingerprint, and deficiency invariants all pass. Converted status never bypasses attestation integrity. Exact-CPT and valid closed clinic-date matching remain required.';
  if (missingUnits > 0) {
    usageNote += ` ${missingUnits} apparently finalized note${missingUnits === 1 ? '' : 's'} missing durable billableUnits were excluded for manual review.`;
  }
  if (integrityReviewCount > 0) {
    usageNote += ` ${integrityReviewCount} apparently finalized note${integrityReviewCount === 1 ? '' : 's'} failed durable attestation integrity and did not consume authorization.`;
  }
  if (!anyUtilizing && anyApproved) {
    usageNote +=
      ' Authorized units are present, but no notes currently satisfy the complete durable attestation chain in these windows, so utilization remains 0.';
  }

  return {
    clientId: input.clientId,
    windows,
    usageMethod: anyExactTrackedUsage ? 'NOTE_BILLABLE_UNITS' : 'AUTHORIZED_ONLY',
    usageNote,
  };
}

// ---------------------------------------------------------------------------
// Auth-unit hard stop (gap 15) — pure convert-time overbill math
// ---------------------------------------------------------------------------

export type AuthUnitManualReviewReason =
  | 'TARGET_SESSION_NOT_FOUND'
  | 'SERVICE_DATE_INVALID'
  | 'CPT_CODE_MISSING'
  | 'NO_ELIGIBLE_AUTH_WINDOW'
  | 'CPT_AUTH_TYPE_UNREVIEWED'
  | 'AUTH_TYPE_CPT_MISMATCH'
  | 'CPT_ATTRIBUTION_UNAVAILABLE'
  | 'AMBIGUOUS_EXACT_CPT_LINES'
  | 'INVALID_AUTHORIZED_UNITS'
  | 'ATTESTATION_INTEGRITY_REVIEW';

export type AuthUnitCandidateProvenance = {
  windowId: string;
  windowSource: AuthWindowSource;
  windowType: string;
  windowStatus: string;
  startDate: string;
  endDate: string;
  authNumber: string | null;
  attribution: CptUnitAttribution;
  matchedCptCode: string | null;
  unitsAuthorized: number | null;
  /** One-based position after deterministic eligible-cycle ranking. */
  candidateRank: number;
};

export type AuthUnitHardStop =
  | {
      enforced: false;
      /**
       * True means conversion must fail closed until staff review/fix the
       * authorization record. Zero-unit notes are the only non-review bypass.
       */
      manualReviewRequired: boolean;
      reason: AuthUnitManualReviewReason | 'NO_BILLABLE_UNITS';
      requestedUnits: number;
      cptCode: string | null;
      candidate: AuthUnitCandidateProvenance | null;
      eligibleCandidateCount: number;
      ineligibleCandidateCount: number;
    }
  | {
      enforced: true;
      manualReviewRequired: false;
      exceeded: boolean;
      requestedUnits: number;
      cptCode: string;
      windowId: string;
      windowSource: AuthWindowSource;
      windowType: string;
      windowStatus: 'APPROVED';
      windowStartDate: string;
      windowEndDate: string;
      authNumber: string | null;
      attribution: 'EXACT_CPT';
      candidateRank: number;
      eligibleCandidateCount: number;
      ineligibleCandidateCount: number;
      unitsAuthorized: number;
      /** Units already burned by OTHER signed/converted notes in this exact CPT/cycle */
      unitsUsedByOtherNotes: number;
      /** Remaining before this note (clamped at 0) */
      remainingBeforeNote: number;
      /** Remaining after this note — negative means overbill by that many units */
      remainingAfterNote: number;
    };

type RawAuthCandidate = {
  windowId: string;
  windowSource: AuthWindowSource;
  windowType: string;
  windowStatus: string;
  authNumber: string | null;
  start: Date | string | null;
  end: Date | string | null;
  aggregateUnits: number | null;
  cptCodes: AuthCptRow[];
};

type EligibleAuthCandidate = RawAuthCandidate & ClosedAuthWindow;

function rawAuthCandidates(
  authorizations: AuthorizationRow[],
  paRequests: PaRequestRow[],
): RawAuthCandidate[] {
  return [
    ...authorizations.map((auth) => ({
      windowId: auth.id,
      windowSource: 'AUTHORIZATION' as const,
      windowType: auth.type,
      windowStatus: auth.status,
      authNumber: auth.authNumber,
      start: auth.startDate,
      end: auth.endDate,
      aggregateUnits: auth.unitsApproved,
      cptCodes: auth.cptCodes ?? [],
    })),
    ...paRequests.map((pa) => ({
      windowId: pa.id,
      windowSource: 'PA_REQUEST' as const,
      windowType: pa.type,
      windowStatus: pa.status,
      authNumber: pa.authNumber,
      start: pa.effectiveDate,
      end: pa.expirationDate,
      aggregateUnits: pa.approvedUnits,
      cptCodes: [],
    })),
  ];
}

function eligibleCandidateForServiceDate(
  candidate: RawAuthCandidate,
  serviceDateKey: string,
): EligibleAuthCandidate | null {
  if (candidate.windowStatus !== 'APPROVED') return null;
  const window = closedAuthWindow(candidate.start, candidate.end);
  if (!window) return null;
  if (serviceDateKey < window.startKey || serviceDateKey > window.endKey) return null;
  return { ...candidate, ...window };
}

function exactCptRows(candidate: EligibleAuthCandidate, cptCode: string): AuthCptRow[] {
  if (candidate.windowSource !== 'AUTHORIZATION') return [];
  return candidate.cptCodes.filter((line) => normalizeCptCode(line.code) === cptCode);
}

function candidateAttribution(
  candidate: EligibleAuthCandidate,
  cptCode: string,
  expectedType: 'ASSESSMENT' | 'TREATMENT',
): CptUnitAttribution {
  if (candidate.windowType !== expectedType) return 'AUTH_TYPE_MISMATCH';
  if (candidate.windowSource === 'PA_REQUEST') return 'UNATTRIBUTED_AGGREGATE';
  const exactRows = exactCptRows(candidate, cptCode);
  if (exactRows.length > 1) return 'AMBIGUOUS_EXACT_CPT';
  if (exactRows.length === 1) return 'EXACT_CPT';
  return candidate.cptCodes.length > 0 ? 'NO_EXACT_CPT' : 'UNATTRIBUTED_AGGREGATE';
}

function attributionRank(attribution: CptUnitAttribution): number {
  switch (attribution) {
    case 'EXACT_CPT':
      return 0;
    case 'AMBIGUOUS_EXACT_CPT':
      return 1;
    case 'NO_EXACT_CPT':
      return 2;
    case 'UNATTRIBUTED_AGGREGATE':
      return 3;
    case 'AUTH_TYPE_MISMATCH':
      return 4;
    case 'UNREVIEWED_CPT':
      return 5;
  }
}

/**
 * Rank by cycle first (newest start/end), then exactness/source within the
 * same cycle, then stable id. Input/DB order can never change the selection.
 */
function rankEligibleCandidates(
  candidates: EligibleAuthCandidate[],
  cptCode: string,
  expectedType: 'ASSESSMENT' | 'TREATMENT',
): EligibleAuthCandidate[] {
  return [...candidates].sort((a, b) => {
    const byStart = b.startKey.localeCompare(a.startKey);
    if (byStart !== 0) return byStart;
    const byEnd = b.endKey.localeCompare(a.endKey);
    if (byEnd !== 0) return byEnd;
    const byAttribution =
      attributionRank(candidateAttribution(a, cptCode, expectedType)) -
      attributionRank(candidateAttribution(b, cptCode, expectedType));
    if (byAttribution !== 0) return byAttribution;
    const bySource =
      (a.windowSource === 'AUTHORIZATION' ? 0 : 1) -
      (b.windowSource === 'AUTHORIZATION' ? 0 : 1);
    if (bySource !== 0) return bySource;
    return a.windowId.localeCompare(b.windowId);
  });
}

function candidateProvenance(
  candidate: EligibleAuthCandidate,
  cptCode: string,
  expectedType: 'ASSESSMENT' | 'TREATMENT',
  candidateRank: number,
): AuthUnitCandidateProvenance {
  const attribution = candidateAttribution(candidate, cptCode, expectedType);
  const exactRows = exactCptRows(candidate, cptCode);
  const unitsAuthorized =
    attribution === 'EXACT_CPT' && exactRows.length === 1
      ? exactRows[0].unitsApproved
      : candidate.aggregateUnits;
  return {
    windowId: candidate.windowId,
    windowSource: candidate.windowSource,
    windowType: candidate.windowType,
    windowStatus: candidate.windowStatus,
    startDate: candidate.startKey,
    endDate: candidate.endKey,
    authNumber: candidate.authNumber,
    attribution,
    matchedCptCode: exactRows.length > 0 ? cptCode : null,
    unitsAuthorized,
    candidateRank,
  };
}

function unresolvedAuthUnits(input: {
  reason: AuthUnitManualReviewReason | 'NO_BILLABLE_UNITS';
  requestedUnits: number;
  cptCode: string | null;
  candidate?: AuthUnitCandidateProvenance | null;
  eligibleCandidateCount?: number;
  ineligibleCandidateCount?: number;
  manualReviewRequired?: boolean;
}): Extract<AuthUnitHardStop, { enforced: false }> {
  return {
    enforced: false,
    manualReviewRequired: input.manualReviewRequired ?? true,
    reason: input.reason,
    requestedUnits: input.requestedUnits,
    cptCode: input.cptCode,
    candidate: input.candidate ?? null,
    eligibleCandidateCount: input.eligibleCandidateCount ?? 0,
    ineligibleCandidateCount: input.ineligibleCandidateCount ?? 0,
  };
}

/**
 * Would converting this session's note exceed the client's remaining
 * authorized units for its CPT / auth window?
 *
 * The target note is bcbaSigned by the time convert runs, so its session is
 * excluded from prior usage. Only an approved, valid, closed clinic-date
 * window with one explicit exact CPT line can enforce automatically.
 * Anything unattributed/ambiguous returns a typed fail-closed review result.
 */
export function evaluateAuthUnitHardStop(input: {
  clientId: string;
  targetSessionId: string;
  authorizations: AuthorizationRow[];
  paRequests: PaRequestRow[];
  sessions: SessionWithNoteRow[];
}): AuthUnitHardStop {
  const target = input.sessions.find((s) => s.id === input.targetSessionId) ?? null;
  if (!target) {
    return unresolvedAuthUnits({
      reason: 'TARGET_SESSION_NOT_FOUND',
      requestedUnits: 0,
      cptCode: null,
    });
  }

  const cptCode = normalizeCptCode(target.cptCode);
  const requestedUnits = sessionNoteBillableUnits(target);
  if (requestedUnits === 0) {
    return unresolvedAuthUnits({
      reason: 'NO_BILLABLE_UNITS',
      requestedUnits,
      cptCode: cptCode || null,
      manualReviewRequired: false,
    });
  }

  const targetNote = target.note;
  if (!targetNote) {
    return unresolvedAuthUnits({
      reason: 'ATTESTATION_INTEGRITY_REVIEW',
      requestedUnits,
      cptCode: cptCode || null,
    });
  }
  const targetAttestation = evaluateAttestationState(
    {
      sessionStatus: target.status,
      ...targetNote,
    },
    'DURABLE',
  );
  if (!targetAttestation.ok) {
    return unresolvedAuthUnits({
      reason: 'ATTESTATION_INTEGRITY_REVIEW',
      requestedUnits,
      cptCode: cptCode || null,
    });
  }

  const serviceDate = sessionServiceDate(target);
  if (!serviceDate) {
    return unresolvedAuthUnits({
      reason: 'SERVICE_DATE_INVALID',
      requestedUnits,
      cptCode: cptCode || null,
    });
  }

  if (!cptCode) {
    return unresolvedAuthUnits({
      reason: 'CPT_CODE_MISSING',
      requestedUnits,
      cptCode: null,
    });
  }

  const rawCandidates = rawAuthCandidates(input.authorizations, input.paRequests);
  const serviceDateKey = clinicDateKey(serviceDate);
  const eligible = rawCandidates
    .map((candidate) => eligibleCandidateForServiceDate(candidate, serviceDateKey))
    .filter((candidate): candidate is EligibleAuthCandidate => candidate != null);
  const ineligibleCandidateCount = rawCandidates.length - eligible.length;

  if (eligible.length === 0) {
    return unresolvedAuthUnits({
      reason: 'NO_ELIGIBLE_AUTH_WINDOW',
      requestedUnits,
      cptCode,
      ineligibleCandidateCount,
    });
  }

  const expectedType = reviewedAuthTypeForCpt(cptCode);
  if (!expectedType) {
    const fallback = [...eligible].sort((a, b) => {
      const byStart = b.startKey.localeCompare(a.startKey);
      if (byStart !== 0) return byStart;
      const byEnd = b.endKey.localeCompare(a.endKey);
      if (byEnd !== 0) return byEnd;
      return a.windowId.localeCompare(b.windowId);
    })[0];
    return unresolvedAuthUnits({
      reason: 'CPT_AUTH_TYPE_UNREVIEWED',
      requestedUnits,
      cptCode,
      candidate: {
        ...candidateProvenance(fallback, cptCode, 'TREATMENT', 1),
        attribution: 'UNREVIEWED_CPT',
      },
      eligibleCandidateCount: eligible.length,
      ineligibleCandidateCount,
    });
  }

  const typeCompatible = eligible.filter((candidate) => candidate.windowType === expectedType);
  if (typeCompatible.length === 0) {
    const mismatch = rankEligibleCandidates(eligible, cptCode, expectedType)[0];
    return unresolvedAuthUnits({
      reason: 'AUTH_TYPE_CPT_MISMATCH',
      requestedUnits,
      cptCode,
      candidate: candidateProvenance(mismatch, cptCode, expectedType, 1),
      eligibleCandidateCount: eligible.length,
      ineligibleCandidateCount,
    });
  }

  const ranked = rankEligibleCandidates(typeCompatible, cptCode, expectedType);
  const selected = ranked[0];
  const provenance = candidateProvenance(selected, cptCode, expectedType, 1);

  if (provenance.attribution === 'AMBIGUOUS_EXACT_CPT') {
    return unresolvedAuthUnits({
      reason: 'AMBIGUOUS_EXACT_CPT_LINES',
      requestedUnits,
      cptCode,
      candidate: provenance,
      eligibleCandidateCount: eligible.length,
      ineligibleCandidateCount,
    });
  }

  if (provenance.attribution !== 'EXACT_CPT') {
    return unresolvedAuthUnits({
      reason: 'CPT_ATTRIBUTION_UNAVAILABLE',
      requestedUnits,
      cptCode,
      candidate: provenance,
      eligibleCandidateCount: eligible.length,
      ineligibleCandidateCount,
    });
  }

  const exactRows = exactCptRows(selected, cptCode);
  const unitsAuthorized = exactRows[0]?.unitsApproved;
  if (
    typeof unitsAuthorized !== 'number' ||
    !Number.isFinite(unitsAuthorized) ||
    !Number.isInteger(unitsAuthorized) ||
    unitsAuthorized < 0
  ) {
    return unresolvedAuthUnits({
      reason: 'INVALID_AUTHORIZED_UNITS',
      requestedUnits,
      cptCode,
      candidate: provenance,
      eligibleCandidateCount: eligible.length,
      ineligibleCandidateCount,
    });
  }

  const otherExactCptSessions = input.sessions.filter(
    (session) =>
      session.id !== input.targetSessionId &&
      isAuthUtilizingSession(session) &&
      normalizeCptCode(session.cptCode) === cptCode &&
      inWindow(sessionServiceDate(session), selected.start, selected.end),
  );
  const unitsUsedByOtherNotes = summarizeSessions(otherExactCptSessions).unitsUsed;
  const remainingBeforeNote = Math.max(0, unitsAuthorized - unitsUsedByOtherNotes);
  const remainingAfterNote = remainingBeforeNote - requestedUnits;

  return {
    enforced: true,
    manualReviewRequired: false,
    exceeded: requestedUnits > remainingBeforeNote,
    requestedUnits,
    cptCode,
    windowId: selected.windowId,
    windowSource: selected.windowSource,
    windowType: selected.windowType,
    windowStatus: 'APPROVED',
    windowStartDate: selected.startKey,
    windowEndDate: selected.endKey,
    authNumber: selected.authNumber,
    attribution: 'EXACT_CPT',
    candidateRank: 1,
    eligibleCandidateCount: eligible.length,
    ineligibleCandidateCount,
    unitsAuthorized,
    unitsUsedByOtherNotes,
    remainingBeforeNote,
    remainingAfterNote,
  };
}
