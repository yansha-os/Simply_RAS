import type { IntakePacketDocFlagKey } from '@/lib/safeParseJson';

/** Upload flags CSS verifies after Intake has approved Form 01 / Form 02. */
export const CLINICAL_VERIFICATION_DOCUMENT_KEYS = [
  'insuranceCardFrontUploaded',
  'insuranceCardBackUploaded',
  'medicaidCardFrontUploaded',
  'medicaidCardBackUploaded',
  'diagnosticEvalUploaded',
  'physicianRxUploaded',
  'iepUploaded',
  'custodyDocsUploaded',
  'priorAbaRecordsUploaded',
] as const satisfies readonly IntakePacketDocFlagKey[];

export type ClinicalVerificationDocumentKey =
  (typeof CLINICAL_VERIFICATION_DOCUMENT_KEYS)[number];

export const CLINICAL_VERIFICATION_DOCUMENT_KEY_SET = new Set<string>(
  CLINICAL_VERIFICATION_DOCUMENT_KEYS,
);

export const CLINICAL_VERIFICATION_DB_TO_FORM_KEY: Record<
  ClinicalVerificationDocumentKey,
  string
> = {
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

export const CLINICAL_VERIFICATION_DOC_LABELS: Record<
  ClinicalVerificationDocumentKey,
  string
> = {
  insuranceCardFrontUploaded: 'Primary Insurance Card (Front)',
  insuranceCardBackUploaded: 'Primary Insurance Card (Back)',
  medicaidCardFrontUploaded: 'Medicaid Card (Front)',
  medicaidCardBackUploaded: 'Medicaid Card (Back)',
  diagnosticEvalUploaded: 'Diagnostic Evaluation Report',
  physicianRxUploaded: 'Physician Referral / Prescription',
  iepUploaded: 'IEP / IFSP',
  custodyDocsUploaded: 'Custody/Guardianship Order',
  priorAbaRecordsUploaded: 'Prior ABA Records',
};

export function isClinicalVerificationDocumentKey(
  key: string,
): key is ClinicalVerificationDocumentKey {
  return CLINICAL_VERIFICATION_DOCUMENT_KEY_SET.has(key);
}

function hasMedicaidCoverage(formData: Record<string, unknown>): boolean {
  return (
    Boolean(formData.hasMedicaid) &&
    formData.hasMedicaid !== 'No' &&
    formData.hasMedicaid !== 'Not Sure'
  );
}

function hasCustodyDocument(formData: Record<string, unknown>): boolean {
  return (
    formData.custodyDocAttached === 'Yes — Attached' ||
    formData.custodyDocAttached === 'Yes — Will Provide'
  );
}

function hasIepDocument(formData: Record<string, unknown>): boolean {
  return (
    formData.hasIEP === 'Yes — Attached' ||
    formData.hasIEP === 'Yes — Will Provide'
  );
}

/** Required clinical uploads for CSS approval — excludes intake forms (already approved by Intake). */
export function getRequiredClinicalVerificationKeys(
  formData: Record<string, unknown>,
): ClinicalVerificationDocumentKey[] {
  const keys: ClinicalVerificationDocumentKey[] = [
    'insuranceCardFrontUploaded',
    'insuranceCardBackUploaded',
    'diagnosticEvalUploaded',
    'physicianRxUploaded',
  ];

  if (hasMedicaidCoverage(formData)) {
    keys.push('medicaidCardFrontUploaded', 'medicaidCardBackUploaded');
  }
  if (hasIepDocument(formData)) {
    keys.push('iepUploaded');
  }
  if (hasCustodyDocument(formData)) {
    keys.push('custodyDocsUploaded');
  }
  if (formData.hasPriorABA === 'Yes') {
    keys.push('priorAbaRecordsUploaded');
  }

  return keys;
}
