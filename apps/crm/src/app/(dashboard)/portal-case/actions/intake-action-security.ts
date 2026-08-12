import { safeParseJson } from '@/lib/safeParseJson';

export const INTAKE_REVIEW_ITEM_KEYS = [
  'intakeFormComplete',
  'consentFormComplete',
  'insuranceCardFrontUploaded',
  'insuranceCardBackUploaded',
  'medicaidCardFrontUploaded',
  'medicaidCardBackUploaded',
  'diagnosticEvalUploaded',
  'physicianRxUploaded',
  'iepUploaded',
  'custodyDocsUploaded',
  'priorAbaRecordsUploaded',
] as const;

export type IntakeReviewItemKey = (typeof INTAKE_REVIEW_ITEM_KEYS)[number];

export const INTAKE_REJECTABLE_DOCUMENT_KEYS = [
  'insuranceCardFrontUploaded',
  'insuranceCardBackUploaded',
  'medicaidCardFrontUploaded',
  'medicaidCardBackUploaded',
  'diagnosticEvalUploaded',
  'physicianRxUploaded',
  'iepUploaded',
  'custodyDocsUploaded',
  'priorAbaRecordsUploaded',
] as const;

export type IntakeRejectableDocumentKey =
  (typeof INTAKE_REJECTABLE_DOCUMENT_KEYS)[number];

export const INTAKE_FORM_01_REVIEW_FIELD_IDS = [
  'childName',
  'preferredName',
  'dob',
  'sexAtBirth',
  'childLivesWithParents',
  'childAddress',
  'primaryLang',
  'otherLang',
  'allergies',
  'meds',
  'medConditions',
  'elopement',
  'diet',
  'g1Name',
  'g1Relation',
  'g1Phone',
  'g1Email',
  'g1Address',
  'g1ContactPref',
  'g1BestTimes',
  'g2Name',
  'g2Relation',
  'g2Phone',
  'g2Email',
  'g2Address',
  'custodyType',
  'custodyLimits',
  'nonParentConsenter',
  'custodyDocAttached',
  'priInsCompany',
  'priInsPlan',
  'priInsMemberId',
  'priInsGroup',
  'priInsHolderName',
  'priInsHolderDob',
  'priInsHolderRel',
  'priInsEffective',
  'priInsPhone',
  'priInsEmployer',
  'hasSecondPlan',
  'secInsCompany',
  'secInsMemberId',
  'secInsGroup',
  'secInsEffective',
  'hasMedicaid',
  'medicaidStateOther',
  'medicaidId',
  'medicaidMCO',
  'medicaidLapsed',
  'medicaidRenewal',
  'pcpName',
  'pcpPractice',
  'pcpPhone',
  'pcpFax',
  'pcpAddress',
  'pcpLastVisit',
  'hasDiagnosis',
  'evalDate',
  'diagnosisText',
  'dxInitialDate',
  'dxRecentDate',
  'dxProviderName',
  'dxCredentials',
  'dxPractice',
  'dxPhone',
  'dxCooccurring',
  'hasReferral',
  'referralProvider',
  'referralDate',
  'referralExpires',
  'referralExpDate',
  'hasPriorABA',
  'priorABAInfo',
  'schoolName',
  'schoolGrade',
  'hasIEP',
  'serviceCoordinator',
  'abaGoals',
  'unsafeBehaviors',
  'childInterests',
  'prefLocation',
  'quietSpace',
  'hasPets',
  'petTypes',
  'othersHome',
  'em1Name',
  'em1Rel',
  'em1Phone',
  'em2Name',
  'em2Rel',
  'em2Phone',
  'emPermission',
  'prefHospital',
  'attestationAgree',
  'attestationName',
] as const;

export const INTAKE_FORM_02_REVIEW_FIELD_IDS = [
  'cpt97151',
  'cpt97153',
  'cpt97154',
  'cpt97155',
  'cpt97156',
  'locHome',
  'locClinic',
  'locCommunity',
  'locSchool',
  'telehealthConsent',
  'telehealthDecline',
  'mediaClinical',
  'mediaTraining',
  'mediaPhotos',
  'mediaMarketing',
  'mediaObservation',
  'hipaaAck',
  'phiInsurance',
  'phiBilling',
  'phiPcp',
  'phiDiagnosing',
  'phiSchool',
  'phiOtherTherapies',
  'phiAdd1Name',
  'phiAdd1Purpose',
  'phiAdd1Initial',
  'phiAdd2Name',
  'phiAdd2Purpose',
  'phiAdd2Initial',
  'aobInitial',
  'attendanceInitial',
  'commPhone',
  'commSms',
  'commEmail',
  'commPortal',
  'emergencyInitial',
  'eSignInitial',
  'sig1Name',
] as const;

export const INTAKE_AVAILABILITY_REVIEW_FIELD_IDS = [
  'avail_Monday_from',
  'avail_Monday_to',
  'avail_Tuesday_from',
  'avail_Tuesday_to',
  'avail_Wednesday_from',
  'avail_Wednesday_to',
  'avail_Thursday_from',
  'avail_Thursday_to',
  'avail_Friday_from',
  'avail_Friday_to',
  'avail_Saturday_from',
  'avail_Saturday_to',
  'avail_Sunday_from',
  'avail_Sunday_to',
] as const;

export type IntakeReviewFormField =
  | (typeof INTAKE_FORM_01_REVIEW_FIELD_IDS)[number]
  | (typeof INTAKE_FORM_02_REVIEW_FIELD_IDS)[number]
  | (typeof INTAKE_AVAILABILITY_REVIEW_FIELD_IDS)[number];

const REVIEW_ITEM_KEY_SET = new Set<string>(INTAKE_REVIEW_ITEM_KEYS);
const REJECTABLE_DOCUMENT_KEY_SET = new Set<string>(
  INTAKE_REJECTABLE_DOCUMENT_KEYS
);
const FORM_02_FIELD_SET = new Set<string>(INTAKE_FORM_02_REVIEW_FIELD_IDS);
const REVIEWABLE_FORM_FIELD_SET = new Set<string>([
  ...INTAKE_FORM_01_REVIEW_FIELD_IDS,
  ...INTAKE_FORM_02_REVIEW_FIELD_IDS,
  ...INTAKE_AVAILABILITY_REVIEW_FIELD_IDS,
]);

const DOCUMENT_FORM_KEYS: Record<IntakeRejectableDocumentKey, string> = {
  insuranceCardFrontUploaded: 'docInsuranceFront',
  insuranceCardBackUploaded: 'docInsuranceBack',
  medicaidCardFrontUploaded: 'docMedicaidFront',
  medicaidCardBackUploaded: 'docMedicaidBack',
  diagnosticEvalUploaded: 'docEval',
  physicianRxUploaded: 'docReferral',
  iepUploaded: 'docIEP',
  custodyDocsUploaded: 'docCustody',
  priorAbaRecordsUploaded: 'docPriorABA',
};

const PROTOTYPE_POLLUTION_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CORRECTION_FIELDS = 50;
const MAX_REASON_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 4000;

export type IntakeActionFailureCode =
  | 'AUTHORIZATION_FAILED'
  | 'INVALID_ID'
  | 'NOT_FOUND'
  | 'PACKET_CLIENT_MISMATCH'
  | 'INVALID_STATUS'
  | 'INVALID_DOCUMENT_KEY'
  | 'INVALID_FORM_FIELD'
  | 'INVALID_REASON'
  | 'INVALID_MESSAGE'
  | 'MISSING_REQUIRED_ITEMS'
  | 'STALE_WRITE'
  | 'OPERATION_FAILED';

export type IntakeActionFailure = {
  success: false;
  code: IntakeActionFailureCode;
  error: string;
};

export type IntakeActionResult =
  | { success: true }
  | IntakeActionFailure;

type PolicyFailure = {
  ok: false;
  code: IntakeActionFailureCode;
  error: string;
};

type PolicyResult<T = never> =
  | ({ ok: true } & ([T] extends [never] ? object : { value: T }))
  | PolicyFailure;

export type IntakePacketSnapshot = {
  id: string;
  clientId: string;
  status: string;
  updatedAt: Date;
  clientChangeRequested: boolean;
  formData: unknown;
  rejectionDetails: unknown;
  intakeFormComplete: boolean;
  consentFormComplete: boolean;
  insuranceCardFrontUploaded: boolean;
  insuranceCardBackUploaded: boolean;
  medicaidCardFrontUploaded: boolean;
  medicaidCardBackUploaded: boolean;
  diagnosticEvalUploaded: boolean;
  physicianRxUploaded: boolean;
  iepUploaded: boolean;
  custodyDocsUploaded: boolean;
  priorAbaRecordsUploaded: boolean;
};

export type IntakeClientPacketSnapshot = {
  id: string;
  status: string;
  updatedAt: Date;
  intakePacket: IntakePacketSnapshot | null;
};

type IntakeAuthGate<User> =
  | { ok: true; user: User }
  | { ok: false; error: string };

export function intakeActionFailure(
  code: IntakeActionFailureCode,
  error: string
): IntakeActionFailure {
  return { success: false, code, error };
}

export async function runAuthorizedIntakeAction<User, Result>(
  authenticate: () => Promise<IntakeAuthGate<User>>,
  operation: (user: User) => Promise<Result>
): Promise<Result | IntakeActionFailure> {
  const gate = await authenticate();
  if (!gate.ok) {
    return intakeActionFailure('AUTHORIZATION_FAILED', gate.error);
  }
  return operation(gate.user);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isIntakeReviewItemKey(
  key: string
): key is IntakeReviewItemKey {
  return (
    !PROTOTYPE_POLLUTION_KEYS.has(key) &&
    REVIEW_ITEM_KEY_SET.has(key)
  );
}

export function isRejectableIntakeDocumentKey(
  key: string
): key is IntakeRejectableDocumentKey {
  return (
    !PROTOTYPE_POLLUTION_KEYS.has(key) &&
    REJECTABLE_DOCUMENT_KEY_SET.has(key)
  );
}

export function isReviewableIntakeFormField(
  fieldId: string
): fieldId is IntakeReviewFormField {
  return (
    !PROTOTYPE_POLLUTION_KEYS.has(fieldId) &&
    REVIEWABLE_FORM_FIELD_SET.has(fieldId)
  );
}

function policyFailure(
  code: IntakeActionFailureCode,
  error: string
): PolicyFailure {
  return { ok: false, code, error };
}

export function validateBoundIntakePacket(
  client: IntakeClientPacketSnapshot | null,
  expectedClientId: string,
  expectedPacketId: string
): PolicyResult {
  if (!client || client.id !== expectedClientId || !client.intakePacket) {
    return policyFailure(
      'NOT_FOUND',
      'The client or intake packet could not be found.'
    );
  }
  if (
    client.intakePacket.id !== expectedPacketId ||
    client.intakePacket.clientId !== client.id
  ) {
    return policyFailure(
      'PACKET_CLIENT_MISMATCH',
      'Packet does not belong to this client.'
    );
  }
  return { ok: true };
}

export function validateMagicLinkCreationState(
  client: IntakeClientPacketSnapshot | null,
  expectedClientId: string
): PolicyResult {
  if (!client || client.id !== expectedClientId) {
    return policyFailure('NOT_FOUND', 'Client not found.');
  }
  if (client.status !== 'INQUIRY' || client.intakePacket) {
    return policyFailure(
      'INVALID_STATUS',
      'A parent link can only be created for a new inquiry without an intake packet.'
    );
  }
  return { ok: true };
}

export function validateMagicLinkRotationState(
  client: IntakeClientPacketSnapshot | null,
  expectedClientId: string,
  expectedPacketId: string
): PolicyResult {
  const binding = validateBoundIntakePacket(
    client,
    expectedClientId,
    expectedPacketId
  );
  if (!binding.ok) return binding;

  const packet = client!.intakePacket!;
  const validClientStatus =
    client!.status === 'MAGIC_LINK_SENT' ||
    client!.status === 'DOCS_SUBMITTED';
  const validPacketStatus =
    packet.status === 'PENDING_CLIENT_SUBMISSION' ||
    packet.status === 'SUBMITTED';
  if (!validClientStatus || !validPacketStatus) {
    return policyFailure(
      'INVALID_STATUS',
      'The parent link can no longer be changed at this intake stage.'
    );
  }
  return { ok: true };
}

export function validateSubmittedIntakeReview(
  client: IntakeClientPacketSnapshot | null,
  expectedClientId: string,
  expectedPacketId: string
): PolicyResult {
  const binding = validateBoundIntakePacket(
    client,
    expectedClientId,
    expectedPacketId
  );
  if (!binding.ok) return binding;

  if (
    client!.status !== 'DOCS_SUBMITTED' ||
    client!.intakePacket!.status !== 'SUBMITTED'
  ) {
    return policyFailure(
      'INVALID_STATUS',
      'This action is only available while submitted intake documents are under review.'
    );
  }
  return { ok: true };
}

export function validateUnlockRequest(
  client: IntakeClientPacketSnapshot | null,
  expectedClientId: string,
  expectedPacketId: string
): PolicyResult {
  const review = validateSubmittedIntakeReview(
    client,
    expectedClientId,
    expectedPacketId
  );
  if (!review.ok) return review;
  if (!client!.intakePacket!.clientChangeRequested) {
    return policyFailure(
      'INVALID_STATUS',
      'There is no pending parent change request to unlock.'
    );
  }
  return { ok: true };
}

function safeJsonRecord(raw: unknown): Record<string, unknown> {
  const parsed = safeParseJson<unknown>(raw, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([key]) => !PROTOTYPE_POLLUTION_KEYS.has(key)
    )
  );
}

function canonicalRejectionDetails(raw: unknown): Record<string, string> {
  const parsed = safeJsonRecord(raw);
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.length > MAX_REASON_LENGTH) {
      continue;
    }
    const allowedDocument = isRejectableIntakeDocumentKey(key);
    const allowedField =
      key.startsWith('formField_') &&
      isReviewableIntakeFormField(key.slice('formField_'.length));
    if (allowedDocument || allowedField) details[key] = value;
  }
  return details;
}

function normalizeCorrectionReason(
  raw: unknown
): PolicyResult<string> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < 5) {
    return policyFailure(
      'INVALID_REASON',
      'Provide a specific correction reason (at least 5 characters).'
    );
  }
  if (value.length > MAX_REASON_LENGTH) {
    return policyFailure(
      'INVALID_REASON',
      `Correction reasons must be ${MAX_REASON_LENGTH} characters or fewer.`
    );
  }
  return { ok: true, value };
}

export type NormalizedFormCorrection = {
  fieldId: IntakeReviewFormField;
  reason: string;
};

export function normalizeFormCorrections(
  rawFields: unknown
): PolicyResult<NormalizedFormCorrection[]> {
  if (
    !Array.isArray(rawFields) ||
    rawFields.length === 0 ||
    rawFields.length > MAX_CORRECTION_FIELDS
  ) {
    return policyFailure(
      'INVALID_FORM_FIELD',
      `Select between 1 and ${MAX_CORRECTION_FIELDS} form fields.`
    );
  }

  const normalized: NormalizedFormCorrection[] = [];
  const seen = new Set<string>();
  for (const rawField of rawFields) {
    if (
      !rawField ||
      typeof rawField !== 'object' ||
      Array.isArray(rawField)
    ) {
      return policyFailure(
        'INVALID_FORM_FIELD',
        'One or more selected form fields are invalid.'
      );
    }
    const field = rawField as Record<string, unknown>;
    const fieldId = typeof field.fieldId === 'string' ? field.fieldId : '';
    if (
      fieldId !== fieldId.trim() ||
      !isReviewableIntakeFormField(fieldId)
    ) {
      return policyFailure(
        'INVALID_FORM_FIELD',
        'One or more selected form fields are invalid.'
      );
    }
    if (seen.has(fieldId)) continue;

    const reason = normalizeCorrectionReason(field.reason);
    if (!reason.ok) return reason;
    normalized.push({ fieldId, reason: reason.value });
    seen.add(fieldId);
  }

  return { ok: true, value: normalized };
}

export function buildDocumentCorrectionPatch(
  packet: IntakePacketSnapshot,
  rawDocumentKey: string,
  rawReason: unknown
): PolicyResult<Record<string, unknown>> {
  if (!isRejectableIntakeDocumentKey(rawDocumentKey)) {
    return policyFailure(
      'INVALID_DOCUMENT_KEY',
      'Invalid document key.'
    );
  }
  const reason = normalizeCorrectionReason(rawReason);
  if (!reason.ok) return reason;

  const formData = safeJsonRecord(packet.formData);
  delete formData[DOCUMENT_FORM_KEYS[rawDocumentKey]];
  const rejectionDetails = canonicalRejectionDetails(
    packet.rejectionDetails
  );
  rejectionDetails[rawDocumentKey] = reason.value;

  return {
    ok: true,
    value: {
      [rawDocumentKey]: false,
      formData,
      rejectionDetails,
      status: 'PENDING_CLIENT_SUBMISSION',
    },
  };
}

export function buildFormCorrectionPatch(
  packet: IntakePacketSnapshot,
  rawFields: unknown
): PolicyResult<Record<string, unknown>> {
  const fields = normalizeFormCorrections(rawFields);
  if (!fields.ok) return fields;

  const formData = safeJsonRecord(packet.formData);
  const rejectionDetails = canonicalRejectionDetails(
    packet.rejectionDetails
  );
  let intakeFormComplete = packet.intakeFormComplete;
  let consentFormComplete = packet.consentFormComplete;

  for (const field of fields.value) {
    delete formData[field.fieldId];
    rejectionDetails[`formField_${field.fieldId}`] = field.reason;

    if (field.fieldId === 'attestationName') {
      delete formData.attestationDate;
    }
    if (field.fieldId === 'sig1Name') {
      delete formData.sig1Date;
    }

    if (FORM_02_FIELD_SET.has(field.fieldId)) {
      consentFormComplete = false;
    } else {
      intakeFormComplete = false;
    }
  }

  return {
    ok: true,
    value: {
      formData,
      rejectionDetails,
      status: 'PENDING_CLIENT_SUBMISSION',
      intakeFormComplete,
      consentFormComplete,
    },
  };
}

function isAuthorizedDocumentPath(
  path: string | null,
  clientId: string
): boolean {
  if (!path) return false;
  const separatorIndex = path.indexOf('/');
  if (
    separatorIndex < 1 ||
    path.slice(0, separatorIndex) !== clientId
  ) {
    return false;
  }
  return /^[a-zA-Z0-9._-]{1,160}$/.test(
    path.slice(separatorIndex + 1)
  );
}

export function hasAuthorizedDocumentRoute(
  value: unknown,
  clientId: string
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const url = (value as Record<string, unknown>).url;
  if (typeof url !== 'string') return false;

  const [pathname, query = ''] = url.split('?', 2);
  if (pathname !== '/api/documents') return false;
  return isAuthorizedDocumentPath(
    new URLSearchParams(query).get('path'),
    clientId
  );
}

export function requiredIntakeReviewItemKeys(
  rawFormData: unknown
): IntakeReviewItemKey[] {
  const formData = safeJsonRecord(rawFormData);
  const keys: IntakeReviewItemKey[] = [
    'intakeFormComplete',
    'consentFormComplete',
    'insuranceCardFrontUploaded',
    'insuranceCardBackUploaded',
    'diagnosticEvalUploaded',
    'physicianRxUploaded',
  ];

  const hasMedicaid =
    Boolean(formData.hasMedicaid) &&
    formData.hasMedicaid !== 'No' &&
    formData.hasMedicaid !== 'Not Sure';
  const hasCustodyDoc =
    formData.custodyDocAttached === 'Yes — Attached' ||
    formData.custodyDocAttached === 'Yes — Will Provide';
  const hasIep =
    formData.hasIEP === 'Yes — Attached' ||
    formData.hasIEP === 'Yes — Will Provide';

  if (hasMedicaid) {
    keys.push(
      'medicaidCardFrontUploaded',
      'medicaidCardBackUploaded'
    );
  }
  if (hasCustodyDoc) keys.push('custodyDocsUploaded');
  if (hasIep) keys.push('iepUploaded');
  if (formData.hasPriorABA === 'Yes') {
    keys.push('priorAbaRecordsUploaded');
  }
  return keys;
}

export function validatePacketReadyForClinical(
  client: IntakeClientPacketSnapshot | null,
  expectedClientId: string,
  expectedPacketId: string
): PolicyResult {
  const review = validateSubmittedIntakeReview(
    client,
    expectedClientId,
    expectedPacketId
  );
  if (!review.ok) return review;

  const packet = client!.intakePacket!;
  const formData = safeJsonRecord(packet.formData);
  const missing = requiredIntakeReviewItemKeys(formData).filter((key) => {
    if (!packet[key]) return true;
    if (!isRejectableIntakeDocumentKey(key)) return false;
    return !hasAuthorizedDocumentRoute(
      formData[DOCUMENT_FORM_KEYS[key]],
      expectedClientId
    );
  });
  if (missing.length > 0) {
    return policyFailure(
      'MISSING_REQUIRED_ITEMS',
      'Every required form and secure upload must be available before sending this packet to Clinical.'
    );
  }
  return { ok: true };
}

export function validateReviewItemAvailability(
  packet: IntakePacketSnapshot,
  clientId: string,
  key: IntakeReviewItemKey
): PolicyResult {
  if (!packet[key]) {
    return policyFailure(
      'INVALID_STATUS',
      'This intake item is not available for review.'
    );
  }
  if (!isRejectableIntakeDocumentKey(key)) return { ok: true };

  const formData = safeJsonRecord(packet.formData);
  if (
    !hasAuthorizedDocumentRoute(
      formData[DOCUMENT_FORM_KEYS[key]],
      clientId
    )
  ) {
    return policyFailure(
      'INVALID_STATUS',
      'This document is not available through the authorized client document route.'
    );
  }
  return { ok: true };
}

export function deriveMessageMutation(
  via: 'staff' | 'parent',
  rawContent: unknown
): PolicyResult<{
  content: string;
  isFromClient: boolean;
  senderName: string;
}> {
  const content =
    typeof rawContent === 'string' ? rawContent.trim() : '';
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    return policyFailure(
      'INVALID_MESSAGE',
      `Messages must contain between 1 and ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  return {
    ok: true,
    value: {
      content,
      isFromClient: via === 'parent',
      senderName: via === 'parent' ? 'Client' : 'Clinic Concierge',
    },
  };
}

export function deriveReadDirection(
  via: 'staff' | 'parent'
): boolean {
  return via === 'staff';
}

function parseIntakeDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;

  const usMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (usMatch) {
    month = Number(usMatch[1]);
    day = Number(usMatch[2]);
    year = Number(usMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function trimmedFormString(
  formData: Record<string, unknown>,
  key: string
): string | undefined {
  const value = formData[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export type IntakeClientProfilePatch = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  childAge?: number;
  childGender?: string;
  insurancePayer?: string;
  memberId?: string;
  medicaidId?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  parentAddress?: string;
};

export function buildIntakeClientProfilePatch(
  rawFormData: unknown,
  now = new Date()
): IntakeClientProfilePatch {
  const formData = safeJsonRecord(rawFormData);
  const patch: IntakeClientProfilePatch = {};
  const childName = trimmedFormString(formData, 'childName');
  if (childName) {
    const parts = childName.split(/\s+/);
    patch.firstName = parts[0];
    patch.lastName = parts.slice(1).join(' ');
  }

  const dateOfBirth = parseIntakeDate(formData.dob);
  if (dateOfBirth) {
    patch.dateOfBirth = dateOfBirth;
    let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const beforeBirthday =
      now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
      (now.getUTCMonth() === dateOfBirth.getUTCMonth() &&
        now.getUTCDate() < dateOfBirth.getUTCDate());
    if (beforeBirthday) age -= 1;
    if (age >= 0 && age <= 120) patch.childAge = age;
  }

  const mappings = [
    ['sexAtBirth', 'childGender'],
    ['priInsCompany', 'insurancePayer'],
    ['priInsMemberId', 'memberId'],
    ['medicaidId', 'medicaidId'],
    ['g1Name', 'guardianName'],
    ['g1Phone', 'guardianPhone'],
    ['g1Email', 'guardianEmail'],
    ['g1Address', 'parentAddress'],
  ] as const;
  for (const [formKey, clientKey] of mappings) {
    const value = trimmedFormString(formData, formKey);
    if (value) patch[clientKey] = value;
  }
  return patch;
}

export class IntakeWriteConflictError extends Error {
  constructor() {
    super('STALE_INTAKE_WRITE');
    this.name = 'IntakeWriteConflictError';
  }
}

export function assertSingleConditionalWrite(count: number): void {
  if (count !== 1) throw new IntakeWriteConflictError();
}

export function isIntakeWriteConflict(error: unknown): boolean {
  if (error instanceof IntakeWriteConflictError) return true;
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'P2002' || code === 'P2034';
}
