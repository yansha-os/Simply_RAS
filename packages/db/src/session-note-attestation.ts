/**
 * Database-free SessionNote attestation policy shared by CRM and HRM.
 *
 * Keep this module free of Prisma/Next imports so read models, actions, and
 * property tests all evaluate the same fail-closed durable state.
 */

export const REQUIRED_CHECKLIST_KEYS = [
  'SESSION_TIME',
  'UNITS',
  'CPT_POS',
  'PERSONS_PRESENT',
  'GOALS_DATA',
  'INTERVENTIONS',
  'CLIENT_RESPONSE',
  'BARRIERS',
  'CAREGIVER_DEBRIEF',
  'PLAN_NEXT',
  'RBT_SIGN',
  'CAREGIVER_SIGN',
  'DURABLE_TARGETS',
] as const;

export type AttestationRequirement = 'BCBA_SIGN' | 'DURABLE';

export type SessionNoteAttestationInput = {
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
  checklistSnapshot: unknown;
  openDeficiencyCount: unknown;
  billableUnits: unknown;
  submissionFingerprint: unknown;
  isConverted?: unknown;
};

export type AttestationFailureCode =
  | 'ATTESTATION_FLAGS_MALFORMED'
  | 'SESSION_STATUS_MALFORMED'
  | 'SESSION_NOT_COMPLETED'
  | 'PARENT_ATTESTATION_MISSING'
  | 'PARENT_SIGNER_METADATA_INCOMPLETE'
  | 'RBT_ATTESTATION_MISSING'
  | 'RBT_SIGNER_METADATA_INCOMPLETE'
  | 'BCBA_ATTESTATION_MISSING'
  | 'BCBA_ATTESTATION_ALREADY_PRESENT'
  | 'BCBA_SIGNER_METADATA_INCOMPLETE'
  | 'NOTE_ALREADY_CONVERTED'
  | 'CHECKLIST_MISSING'
  | 'CHECKLIST_MALFORMED'
  | 'CHECKLIST_INCONSISTENT'
  | 'CHECKLIST_FAILED'
  | 'DEFICIENCY_STATE_MALFORMED'
  | 'OPEN_DEFICIENCY'
  | 'BILLABLE_UNITS_MISSING'
  | 'BILLABLE_UNITS_MALFORMED'
  | 'BILLABLE_UNITS_NON_POSITIVE'
  | 'SUBMISSION_FINGERPRINT_MISSING'
  | 'SUBMISSION_FINGERPRINT_MALFORMED';

export type AttestationEvaluation =
  | {
      ok: true;
      billableUnits: number;
      submissionFingerprint: string;
    }
  | {
      ok: false;
      code: AttestationFailureCode;
      reason: string;
      manualReviewRequired: boolean;
    };

export type ChecklistEvaluation =
  | { ok: true; passed: true }
  | {
      ok: false;
      code:
        | 'CHECKLIST_MISSING'
        | 'CHECKLIST_MALFORMED'
        | 'CHECKLIST_INCONSISTENT'
        | 'CHECKLIST_FAILED';
      reason: string;
      manualReviewRequired: boolean;
    };

const FINGERPRINT_RE = /^[0-9a-f]{64}$/i;

function failure(
  code: AttestationFailureCode,
  reason: string,
  manualReviewRequired = false,
): AttestationEvaluation {
  return { ok: false, code, reason, manualReviewRequired };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonblankName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 2;
}

function isValidTimestamp(value: unknown): boolean {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return Number.isFinite(Date.parse(value));
}

export function evaluateChecklistSnapshot(snapshot: unknown): ChecklistEvaluation {
  if (snapshot == null) {
    return {
      ok: false,
      code: 'CHECKLIST_MISSING',
      reason: 'The server checklist snapshot is missing.',
      manualReviewRequired: true,
    };
  }
  if (!isRecord(snapshot)) {
    return {
      ok: false,
      code: 'CHECKLIST_MALFORMED',
      reason: 'The server checklist snapshot has an unsupported legacy shape.',
      manualReviewRequired: true,
    };
  }

  const { schemaVersion, passed, checkedAt, items } = snapshot;
  if (
    schemaVersion !== 1 ||
    typeof passed !== 'boolean' ||
    !isValidTimestamp(checkedAt) ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return {
      ok: false,
      code: 'CHECKLIST_MALFORMED',
      reason: 'The server checklist snapshot is incomplete or malformed.',
      manualReviewRequired: true,
    };
  }

  const keys = new Set<string>();
  const itemStates: boolean[] = [];
  for (const item of items) {
    if (
      !isRecord(item) ||
      typeof item.key !== 'string' ||
      item.key.trim().length === 0 ||
      typeof item.label !== 'string' ||
      item.label.trim().length === 0 ||
      typeof item.standard !== 'string' ||
      item.standard.trim().length === 0 ||
      typeof item.ok !== 'boolean' ||
      keys.has(item.key)
    ) {
      return {
        ok: false,
        code: 'CHECKLIST_MALFORMED',
        reason: 'The server checklist contains malformed or duplicate items.',
        manualReviewRequired: true,
      };
    }
    keys.add(item.key);
    itemStates.push(item.ok);
  }

  if (REQUIRED_CHECKLIST_KEYS.some((key) => !keys.has(key))) {
    return {
      ok: false,
      code: 'CHECKLIST_MALFORMED',
      reason: 'The server checklist is missing one or more canonical controls.',
      manualReviewRequired: true,
    };
  }

  const derivedPassed = itemStates.every(Boolean);
  if (passed !== derivedPassed) {
    return {
      ok: false,
      code: 'CHECKLIST_INCONSISTENT',
      reason: 'The checklist pass flag conflicts with its item results.',
      manualReviewRequired: true,
    };
  }
  if (!passed) {
    return {
      ok: false,
      code: 'CHECKLIST_FAILED',
      reason: 'The server checklist did not pass.',
      manualReviewRequired: false,
    };
  }
  return { ok: true, passed: true };
}

export function checklistPassedFromSnapshot(snapshot: unknown): boolean | null {
  const result = evaluateChecklistSnapshot(snapshot);
  if (result.ok) return true;
  return result.code === 'CHECKLIST_FAILED' ? false : null;
}

export function extractSubmissionFingerprint(structuredContent: unknown): string | null {
  if (!isRecord(structuredContent)) return null;
  const value = structuredContent.submissionFingerprint;
  return typeof value === 'string' && FINGERPRINT_RE.test(value) ? value : null;
}

export function isSubmissionFingerprint(value: unknown): value is string {
  return typeof value === 'string' && FINGERPRINT_RE.test(value);
}

export function evaluateAttestationState(
  input: SessionNoteAttestationInput,
  requirement: AttestationRequirement,
): AttestationEvaluation {
  if (
    typeof input.parentSigned !== 'boolean' ||
    typeof input.rbtSigned !== 'boolean' ||
    typeof input.bcbaSigned !== 'boolean' ||
    (input.isConverted !== undefined && typeof input.isConverted !== 'boolean')
  ) {
    return failure(
      'ATTESTATION_FLAGS_MALFORMED',
      'One or more attestation flags have a malformed legacy value.',
      true,
    );
  }
  if (typeof input.sessionStatus !== 'string') {
    return failure(
      'SESSION_STATUS_MALFORMED',
      'The session status has a malformed legacy value.',
      true,
    );
  }
  if (input.sessionStatus !== 'COMPLETED') {
    return failure(
      'SESSION_NOT_COMPLETED',
      'The Session must be COMPLETED before this attestation can be consumed.',
    );
  }
  if (!input.parentSigned) {
    return failure(
      'PARENT_ATTESTATION_MISSING',
      'Caregiver/parent attestation is required.',
    );
  }
  if (!isNonblankName(input.parentSignerName) || !isValidTimestamp(input.parentSignedAt)) {
    return failure(
      'PARENT_SIGNER_METADATA_INCOMPLETE',
      'Caregiver/parent signer name and timestamp are incomplete.',
      true,
    );
  }
  if (!input.rbtSigned) {
    return failure('RBT_ATTESTATION_MISSING', 'RBT attestation is required.');
  }
  if (!isNonblankName(input.rbtSignerName) || !isValidTimestamp(input.rbtSignedAt)) {
    return failure(
      'RBT_SIGNER_METADATA_INCOMPLETE',
      'RBT signer name and timestamp are incomplete.',
      true,
    );
  }
  if (input.isConverted === true && requirement === 'BCBA_SIGN') {
    return failure(
      'NOTE_ALREADY_CONVERTED',
      'A converted note is locked and cannot receive a new BCBA signature.',
      true,
    );
  }
  if (requirement === 'BCBA_SIGN' && input.bcbaSigned) {
    return failure(
      'BCBA_ATTESTATION_ALREADY_PRESENT',
      'The BCBA attestation is already present.',
    );
  }

  const checklist = evaluateChecklistSnapshot(input.checklistSnapshot);
  if (!checklist.ok) {
    return failure(
      checklist.code,
      checklist.reason,
      checklist.manualReviewRequired,
    );
  }

  if (
    typeof input.openDeficiencyCount !== 'number' ||
    !Number.isInteger(input.openDeficiencyCount) ||
    input.openDeficiencyCount < 0
  ) {
    return failure(
      'DEFICIENCY_STATE_MALFORMED',
      'The open-deficiency count is malformed.',
      true,
    );
  }
  if (input.openDeficiencyCount > 0) {
    return failure(
      'OPEN_DEFICIENCY',
      'Every open note deficiency must be corrected and resolved first.',
    );
  }

  if (input.billableUnits == null) {
    return failure(
      'BILLABLE_UNITS_MISSING',
      'Durable SessionNote.billableUnits are missing.',
      true,
    );
  }
  if (
    typeof input.billableUnits !== 'number' ||
    !Number.isFinite(input.billableUnits) ||
    !Number.isInteger(input.billableUnits)
  ) {
    return failure(
      'BILLABLE_UNITS_MALFORMED',
      'Durable SessionNote.billableUnits are malformed.',
      true,
    );
  }
  if (input.billableUnits <= 0) {
    return failure(
      'BILLABLE_UNITS_NON_POSITIVE',
      'Positive durable SessionNote.billableUnits are required.',
    );
  }

  if (input.submissionFingerprint == null || input.submissionFingerprint === '') {
    return failure(
      'SUBMISSION_FINGERPRINT_MISSING',
      'The canonical Session Studio submission fingerprint is missing.',
      true,
    );
  }
  if (!isSubmissionFingerprint(input.submissionFingerprint)) {
    return failure(
      'SUBMISSION_FINGERPRINT_MALFORMED',
      'The Session Studio submission fingerprint is malformed.',
      true,
    );
  }

  if (requirement === 'DURABLE') {
    if (!input.bcbaSigned) {
      return failure('BCBA_ATTESTATION_MISSING', 'BCBA attestation is required.');
    }
    if (!isNonblankName(input.bcbaSignerName) || !isValidTimestamp(input.bcbaSignedAt)) {
      return failure(
        'BCBA_SIGNER_METADATA_INCOMPLETE',
        'BCBA signer name and timestamp are incomplete.',
        true,
      );
    }
  }

  return {
    ok: true,
    billableUnits: input.billableUnits,
    submissionFingerprint: input.submissionFingerprint,
  };
}

const SIGNATURE_PROJECTION_KEYS = new Set([
  'submissionfingerprint',
  'bcbasignature',
  'rbtsignature',
  'parentsignature',
  'caregiversignature',
  'signatures',
  'rbtsignedat',
  'parentsignedat',
  'bcbasignedat',
  'rbtsignername',
  'parentsignername',
  'bcbasignername',
]);

function sanitizeProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProjection);
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SIGNATURE_PROJECTION_KEYS.has(key.toLowerCase())) continue;
    result[key] = sanitizeProjection(entry);
  }
  return result;
}

export function sanitizeStructuredContentForDeficiency(
  structuredContent: unknown,
): Record<string, unknown> | null {
  if (!isRecord(structuredContent)) return null;
  const sanitized = sanitizeProjection(structuredContent) as Record<string, unknown>;
  if ('supervisingBcbaUserId' in sanitized) sanitized.supervisingBcbaUserId = null;
  if ('supervisingBcbaName' in sanitized) sanitized.supervisingBcbaName = null;
  return sanitized;
}

export function normalizePlutusReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
}
