import {
  CLINICAL_VERIFICATION_DB_TO_FORM_KEY,
  CLINICAL_VERIFICATION_DOCUMENT_KEYS,
  isClinicalVerificationDocumentKey,
  getRequiredClinicalVerificationKeys,
  type ClinicalVerificationDocumentKey,
} from '@/lib/clinicalVerificationDocs';
import {
  evaluateClinicalCorrectionSubmit,
  hasPacketFieldValue,
} from '@/lib/magicLinkPacketSubmit';

/** Internal formData key — not parent-facing; stores CSS per-item review progress. */
export const CLINICAL_REVIEW_APPROVALS_KEY = '_clinicalReviewApprovals';

export const CLINICAL_REVIEW_FORM_KEYS = [
  'intakeFormComplete',
  'consentFormComplete',
] as const;

export type ClinicalReviewFormKey = (typeof CLINICAL_REVIEW_FORM_KEYS)[number];

export type ClinicalReviewItemKey =
  | ClinicalReviewFormKey
  | ClinicalVerificationDocumentKey;

const CLINICAL_REVIEW_ITEM_KEY_SET = new Set<string>([
  ...CLINICAL_REVIEW_FORM_KEYS,
  ...CLINICAL_VERIFICATION_DOCUMENT_KEYS,
]);

export function isClinicalReviewItemKey(key: string): key is ClinicalReviewItemKey {
  return CLINICAL_REVIEW_ITEM_KEY_SET.has(key);
}

export function parseClinicalReviewApprovals(
  formData: Record<string, unknown>,
): ClinicalReviewItemKey[] {
  const raw = formData[CLINICAL_REVIEW_APPROVALS_KEY];
  if (!Array.isArray(raw)) return [];

  const seen = new Set<ClinicalReviewItemKey>();
  for (const entry of raw) {
    if (typeof entry !== 'string' || !isClinicalReviewItemKey(entry)) continue;
    seen.add(entry);
  }
  return [...seen];
}

export function addClinicalReviewApproval(
  formData: Record<string, unknown>,
  itemKey: ClinicalReviewItemKey,
): Record<string, unknown> {
  const approvals = new Set(parseClinicalReviewApprovals(formData));
  approvals.add(itemKey);
  return {
    ...formData,
    [CLINICAL_REVIEW_APPROVALS_KEY]: [...approvals],
  };
}

export function removeClinicalReviewApproval(
  formData: Record<string, unknown>,
  itemKey: ClinicalReviewItemKey,
): Record<string, unknown> {
  const approvals = parseClinicalReviewApprovals(formData).filter(
    (key) => key !== itemKey,
  );
  const next = { ...formData };
  if (approvals.length === 0) {
    delete next[CLINICAL_REVIEW_APPROVALS_KEY];
    return next;
  }
  next[CLINICAL_REVIEW_APPROVALS_KEY] = approvals;
  return next;
}

export function clearClinicalReviewApprovals(
  formData: Record<string, unknown>,
): Record<string, unknown> {
  if (!(CLINICAL_REVIEW_APPROVALS_KEY in formData)) return formData;
  const next = { ...formData };
  delete next[CLINICAL_REVIEW_APPROVALS_KEY];
  return next;
}

/** Parent resubmits must not wipe CSS per-item progress stored on the packet. */
export function preserveClinicalReviewApprovals(
  incomingFormData: Record<string, unknown>,
  existingFormData: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...incomingFormData };
  delete next[CLINICAL_REVIEW_APPROVALS_KEY];
  const approvals = parseClinicalReviewApprovals(existingFormData);
  if (approvals.length === 0) return next;
  next[CLINICAL_REVIEW_APPROVALS_KEY] = approvals;
  return next;
}

export const CLINICAL_STAGE_CLIENT_STATUSES = [
  'DOCS_APPROVED_INTAKE',
  'CLINICAL_REVIEW_APPROVED',
] as const;

export function isClinicalStageClientStatus(status: string): boolean {
  return (CLINICAL_STAGE_CLIENT_STATUSES as readonly string[]).includes(status);
}

export function hasOpenClinicalCorrectionFlags(
  rejectionDetails: Record<string, string>,
): boolean {
  return Object.keys(rejectionDetails).length > 0;
}

export type ClinicalCorrectionItemState =
  | 'AWAITING_FAMILY'
  | 'NEEDS_CSS_REVIEW'
  | 'APPROVED';

export type ClinicalCorrectionSummary = {
  awaitingFamilyKeys: string[];
  needsCssReviewKeys: string[];
  hasAwaitingFamily: boolean;
  hasNeedsCssReview: boolean;
};

/** Flagged item has a replacement value (new upload or re-answered field). */
export function clinicalCorrectionKeyHasNewUpload(
  formData: Record<string, unknown>,
  rejectionKey: string,
): boolean {
  if (rejectionKey.startsWith('formField_')) {
    return hasPacketFieldValue(formData[rejectionKey.slice('formField_'.length)]);
  }
  if (isClinicalVerificationDocumentKey(rejectionKey)) {
    return hasPacketFieldValue(
      formData[CLINICAL_VERIFICATION_DB_TO_FORM_KEY[rejectionKey]],
    );
  }
  if (rejectionKey === 'intakeFormComplete' || rejectionKey === 'consentFormComplete') {
    return formData[rejectionKey] === true;
  }
  return hasPacketFieldValue(formData[rejectionKey]);
}

export function resolveClinicalCorrectionItemState(args: {
  isRejected: boolean;
  isApproved: boolean;
  hasNewUpload: boolean;
}): ClinicalCorrectionItemState {
  if (args.isApproved) return 'APPROVED';
  if (!args.isRejected) return 'APPROVED';
  return args.hasNewUpload ? 'NEEDS_CSS_REVIEW' : 'AWAITING_FAMILY';
}

export function summarizeClinicalCorrectionStates(
  formData: Record<string, unknown>,
  rejectionDetails: Record<string, string>,
): ClinicalCorrectionSummary {
  const awaitingFamilyKeys: string[] = [];
  const needsCssReviewKeys: string[] = [];

  for (const key of Object.keys(rejectionDetails)) {
    if (clinicalCorrectionKeyHasNewUpload(formData, key)) {
      needsCssReviewKeys.push(key);
    } else {
      awaitingFamilyKeys.push(key);
    }
  }

  return {
    awaitingFamilyKeys,
    needsCssReviewKeys,
    hasAwaitingFamily: awaitingFamilyKeys.length > 0,
    hasNeedsCssReview: needsCssReviewKeys.length > 0,
  };
}

export function hasAwaitingFamilyClinicalCorrections(
  formData: Record<string, unknown>,
  rejectionDetails: Record<string, string>,
): boolean {
  return summarizeClinicalCorrectionStates(formData, rejectionDetails)
    .hasAwaitingFamily;
}

/** CSS red banner — only while at least one flagged item still has no new file. */
export function shouldShowClinicalWaitingForFamilyBanner(args: {
  clientStatus: string;
  packetStatus: string;
  rejectionDetails: Record<string, string>;
  formData: Record<string, unknown>;
}): boolean {
  if (
    !isClinicalFamilyCorrectionLoop({
      clientStatus: args.clientStatus,
      packetStatus: args.packetStatus,
      rejectionDetails: args.rejectionDetails,
    })
  ) {
    return false;
  }
  return hasAwaitingFamilyClinicalCorrections(args.formData, args.rejectionDetails);
}

/** CSS amber banner — flags remain, but every flagged item has a new file. */
export function shouldShowClinicalNeedsReviewBanner(args: {
  clientStatus: string;
  packetStatus: string;
  rejectionDetails: Record<string, string>;
  formData: Record<string, unknown>;
}): boolean {
  if (
    !isClinicalFamilyCorrectionLoop({
      clientStatus: args.clientStatus,
      packetStatus: args.packetStatus,
      rejectionDetails: args.rejectionDetails,
    })
  ) {
    return false;
  }
  return !hasAwaitingFamilyClinicalCorrections(args.formData, args.rejectionDetails);
}

/**
 * Parent still must upload or click Submit Updates.
 * Prisma doc flags flip true only on magic-link submit — autosave alone is not enough.
 */
export function parentNeedsClinicalCorrectionAction(args: {
  formData: Record<string, unknown>;
  rejectionDetails: Record<string, string>;
  packetDocFlags: Partial<Record<ClinicalVerificationDocumentKey, boolean>>;
}): boolean {
  const summary = summarizeClinicalCorrectionStates(
    args.formData,
    args.rejectionDetails,
  );
  if (summary.hasAwaitingFamily) return true;
  if (!summary.hasNeedsCssReview) return false;

  const evaluation = evaluateClinicalCorrectionSubmit(
    args.formData,
    args.rejectionDetails,
  );
  if (!evaluation.complete) return true;

  for (const key of summary.needsCssReviewKeys) {
    if (!isClinicalVerificationDocumentKey(key)) continue;
    if (args.packetDocFlags[key] !== true) return true;
  }
  return false;
}

/**
 * CSS document/form corrections stay on Clinical Support.
 * Never bounce the packet or client back to Intake.
 */
export function shouldReturnClinicalPacketToIntake(
  _formData?: Record<string, unknown>,
  _rejectionDetails?: Record<string, string>,
): boolean {
  void _formData;
  void _rejectionDetails;
  return false;
}

/** Parent can re-upload while the packet remains APPROVED on the CSS desk. */
export function isClinicalFamilyCorrectionLoop(args: {
  clientStatus: string;
  packetStatus: string;
  rejectionDetails: Record<string, string>;
}): boolean {
  if (!isClinicalStageClientStatus(args.clientStatus)) return false;
  if (!hasOpenClinicalCorrectionFlags(args.rejectionDetails)) return false;
  return (
    args.packetStatus === 'APPROVED' ||
    args.packetStatus === 'PENDING_CLIENT_SUBMISSION'
  );
}

export function nextClientStatusAfterClinicalCorrection(
  currentStatus: string,
): 'DOCS_APPROVED_INTAKE' | null {
  if (currentStatus === 'CLINICAL_REVIEW_APPROVED') return 'DOCS_APPROVED_INTAKE';
  return null;
}

/** After parent re-upload, keep a clinical-stage packet with CSS (not Intake). */
export function packetStatusAfterClinicalCorrectionResubmit(
  clientStatus: string,
): 'APPROVED' | 'SUBMITTED' {
  if (isClinicalStageClientStatus(clientStatus)) {
    return 'APPROVED';
  }
  return 'SUBMITTED';
}

export function clearClinicalDocumentRejection(
  rejectionDetails: Record<string, string>,
  documentKey: ClinicalReviewItemKey,
): Record<string, string> {
  if (!(documentKey in rejectionDetails)) return rejectionDetails;
  const next = { ...rejectionDetails };
  delete next[documentKey];
  return next;
}

export function applyClinicalDocumentCorrection(args: {
  formData: Record<string, unknown>;
  rejectionDetails: Record<string, string>;
  documentKey: ClinicalVerificationDocumentKey;
  reason: string;
}): {
  formData: Record<string, unknown>;
  rejectionDetails: Record<string, string>;
} {
  const nextFormData = { ...args.formData };
  delete nextFormData[CLINICAL_VERIFICATION_DB_TO_FORM_KEY[args.documentKey]];
  const formData = removeClinicalReviewApproval(nextFormData, args.documentKey);
  const rejectionDetails = {
    ...args.rejectionDetails,
    [args.documentKey]: `[Clinical Review] ${args.reason}`,
  };
  return {
    formData,
    rejectionDetails,
  };
}

export type ClinicalReviewRowBadge =
  | 'WAITING_FOR_FAMILY'
  | 'CHANGES_NEEDED'
  | 'APPROVED'
  | 'MISSING'
  | 'NEEDS_REVIEW'
  | 'AWAITING_INTAKE';

/** CSS row badge — family wait stays on CSS; Intake only if the client is actually there. */
export function resolveClinicalReviewRowBadge(args: {
  isRejected: boolean;
  isApproved: boolean;
  isAvailable: boolean;
  clientStatus: string;
  packetStatus: string;
}): ClinicalReviewRowBadge {
  if (args.isRejected && !args.isAvailable) return 'WAITING_FOR_FAMILY';
  if (args.isRejected && args.isAvailable) return 'NEEDS_REVIEW';
  if (args.isApproved) return 'APPROVED';
  if (!args.isAvailable) return 'MISSING';

  const onClinicalDesk =
    args.clientStatus === 'DOCS_APPROVED_INTAKE' &&
    (args.packetStatus === 'APPROVED' ||
      args.packetStatus === 'PENDING_CLIENT_SUBMISSION');
  if (onClinicalDesk) return 'NEEDS_REVIEW';
  return 'AWAITING_INTAKE';
}

/** Keys that must be individually approved before final clinical sign-off. */
export function getRequiredClinicalReviewApprovalKeys(
  formData: Record<string, unknown>,
  options: { includeIntakeForms: boolean },
): ClinicalReviewItemKey[] {
  const keys: ClinicalReviewItemKey[] = [
    ...getRequiredClinicalVerificationKeys(formData),
  ];
  if (options.includeIntakeForms) {
    keys.unshift('consentFormComplete', 'intakeFormComplete');
  }
  return keys;
}

export function hasAllRequiredClinicalReviewApprovals(
  formData: Record<string, unknown>,
  options: { includeIntakeForms: boolean },
): boolean {
  const approved = new Set(parseClinicalReviewApprovals(formData));
  return getRequiredClinicalReviewApprovalKeys(formData, options).every((key) =>
    approved.has(key),
  );
}
