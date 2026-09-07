import {
  CLINICAL_VERIFICATION_DB_TO_FORM_KEY,
  isClinicalVerificationDocumentKey,
  type ClinicalVerificationDocumentKey,
} from '@/lib/clinicalVerificationDocs';

export type PacketDocFlags = {
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

export type PacketFieldEvaluation = {
  complete: boolean;
  missingForm01: string[];
  missingForm02: string[];
  missingDocs: string[];
  docFlags: PacketDocFlags;
  flaggedDocFlags?: Partial<Record<ClinicalVerificationDocumentKey, boolean>>;
};

export type ClinicalCorrectionSubmitEvaluation = PacketFieldEvaluation & {
  flaggedDocFlags: Partial<Record<ClinicalVerificationDocumentKey, boolean>>;
};

const FORM02_REQUIRED_FIELDS = [
  'sig1Name',
  'cpt97151',
  'cpt97153',
  'cpt97155',
  'cpt97156',
  'cpt97154',
  'locHome',
  'locClinic',
  'locCommunity',
  'locSchool',
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
  'aobInitial',
  'attendanceInitial',
  'commPhone',
  'commSms',
  'commEmail',
  'commPortal',
  'emergencyInitial',
  'eSignInitial',
] as const;

const FORM02_FIELD_SET = new Set<string>(FORM02_REQUIRED_FIELDS);

export function hasPacketFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.url === 'string' && rec.url.trim() !== '') return true;
    return Object.keys(rec).length > 0;
  }
  return false;
}

/**
 * Server-side mirror of the ContinuousIntakeForm requirement rules.
 * Flags are derived from what the parent actually filled in / uploaded —
 * nothing is auto-completed (readiness Blocker 3).
 */
export function evaluatePacketFields(
  formData: Record<string, unknown>,
): PacketFieldEvaluation {
  const has = (key: string) => hasPacketFieldValue(formData[key]);

  const form01Required = [
    'childName',
    'dob',
    'sexAtBirth',
    'primaryLang',
    'elopement',
    'g1Name',
    'g1Phone',
    'g1Email',
    'g1ContactPref',
    'custodyType',
    'custodyDocAttached',
    'priInsCompany',
    'priInsMemberId',
    'hasSecondPlan',
    'hasMedicaid',
    'hasDiagnosis',
    'hasReferral',
    'hasPriorABA',
    'hasIEP',
    'prefLocation',
    'em1Name',
    'em1Phone',
    'emPermission',
    'attestationAgree',
    'attestationName',
    'attestationDate',
  ];
  if (!has('childLivesWithParents')) form01Required.push('childAddress');
  if (formData['hasMedicaid'] === 'Yes') form01Required.push('medicaidMCO');
  if (formData['hasDiagnosis'] === 'Yes') {
    form01Required.push(
      'dxInitialDate',
      'dxRecentDate',
      'dxProviderName',
      'dxPracticeName',
    );
  }
  if (formData['hasReferral'] === 'Yes') {
    form01Required.push('referralProvider', 'referralDate', 'referralExpires');
    if (formData['referralExpires'] === 'Yes') form01Required.push('referralExpDate');
  }
  if (formData['prefLocation'] === 'Home') {
    form01Required.push('quietSpace', 'hasPets', 'othersHome');
  }

  const missingForm01 = form01Required.filter((f) => !has(f));
  const missingForm02 = FORM02_REQUIRED_FIELDS.filter((f) => !has(f)).map(String);
  if (!has('telehealthConsent') && !has('telehealthDecline')) {
    missingForm02.push('telehealthConsent/telehealthDecline');
  }

  const hasMedicaid =
    has('hasMedicaid') &&
    formData['hasMedicaid'] !== 'No' &&
    formData['hasMedicaid'] !== 'Not Sure';
  const hasCustodyDoc =
    formData['custodyDocAttached'] === 'Yes — Attached' ||
    formData['custodyDocAttached'] === 'Yes — Will Provide';
  const hasIEP =
    formData['hasIEP'] === 'Yes — Attached' || formData['hasIEP'] === 'Yes — Will Provide';
  const hasPriorABA = formData['hasPriorABA'] === 'Yes';

  const requiredDocs = [
    'docInsuranceFront',
    'docInsuranceBack',
    'docEval',
    'docReferral',
  ];
  if (hasMedicaid) requiredDocs.push('docMedicaidFront', 'docMedicaidBack');
  if (hasIEP) requiredDocs.push('docIEP');
  if (hasCustodyDoc) requiredDocs.push('docCustody');
  if (hasPriorABA) requiredDocs.push('docPriorABA');

  const missingDocs = requiredDocs.filter((d) => !has(d));

  return {
    complete:
      missingForm01.length === 0 &&
      missingForm02.length === 0 &&
      missingDocs.length === 0,
    missingForm01,
    missingForm02,
    missingDocs,
    docFlags: {
      intakeFormComplete: missingForm01.length === 0,
      consentFormComplete: missingForm02.length === 0,
      insuranceCardFrontUploaded: has('docInsuranceFront'),
      insuranceCardBackUploaded: has('docInsuranceBack'),
      medicaidCardFrontUploaded: has('docMedicaidFront'),
      medicaidCardBackUploaded: has('docMedicaidBack'),
      diagnosticEvalUploaded: has('docEval'),
      physicianRxUploaded: has('docReferral'),
      iepUploaded: has('docIEP'),
      custodyDocsUploaded: has('docCustody'),
      priorAbaRecordsUploaded: has('docPriorABA'),
    },
  };
}

/**
 * CSS document corrections only require the flagged items.
 * Form 01/02 and unrelated uploads stay locked and must not block submit.
 */
export function evaluateClinicalCorrectionSubmit(
  formData: Record<string, unknown>,
  rejectionDetails: Record<string, string>,
): ClinicalCorrectionSubmitEvaluation {
  const full = evaluatePacketFields(formData);
  const missingForm01: string[] = [];
  const missingForm02: string[] = [];
  const missingDocs: string[] = [];
  const flaggedDocFlags: Partial<Record<ClinicalVerificationDocumentKey, boolean>> =
    {};

  for (const key of Object.keys(rejectionDetails)) {
    if (key.startsWith('formField_')) {
      const fieldId = key.slice('formField_'.length);
      if (hasPacketFieldValue(formData[fieldId])) continue;
      if (FORM02_FIELD_SET.has(fieldId) || fieldId === 'telehealthOption') {
        missingForm02.push(fieldId);
      } else {
        missingForm01.push(fieldId);
      }
      continue;
    }

    if (key === 'intakeFormComplete' && !full.docFlags.intakeFormComplete) {
      missingForm01.push(...full.missingForm01);
      continue;
    }

    if (key === 'consentFormComplete' && !full.docFlags.consentFormComplete) {
      missingForm02.push(...full.missingForm02);
      continue;
    }

    if (!isClinicalVerificationDocumentKey(key)) continue;

    const formKey = CLINICAL_VERIFICATION_DB_TO_FORM_KEY[key];
    if (!hasPacketFieldValue(formData[formKey])) {
      missingDocs.push(formKey);
      continue;
    }
    flaggedDocFlags[key] = true;
  }

  return {
    complete:
      missingForm01.length === 0 &&
      missingForm02.length === 0 &&
      missingDocs.length === 0,
    missingForm01,
    missingForm02,
    missingDocs,
    docFlags: full.docFlags,
    flaggedDocFlags,
  };
}
