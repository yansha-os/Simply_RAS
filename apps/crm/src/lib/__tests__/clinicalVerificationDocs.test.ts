import { describe, expect, it } from 'vitest';

import {
  getRequiredClinicalVerificationKeys,
  isClinicalVerificationDocumentKey,
} from '../clinicalVerificationDocs';

describe('clinicalVerificationDocs', () => {
  it('requires baseline insurance and clinical uploads only', () => {
    expect(getRequiredClinicalVerificationKeys({})).toEqual([
      'insuranceCardFrontUploaded',
      'insuranceCardBackUploaded',
      'diagnosticEvalUploaded',
      'physicianRxUploaded',
    ]);
  });

  it('never includes intake form completion flags', () => {
    const keys = getRequiredClinicalVerificationKeys({
      hasMedicaid: 'Yes',
      hasIEP: 'Yes — Attached',
      custodyDocAttached: 'Yes — Attached',
      hasPriorABA: 'Yes',
    });

    expect(keys).not.toContain('intakeFormComplete');
    expect(keys).not.toContain('consentFormComplete');
    expect(keys).toEqual([
      'insuranceCardFrontUploaded',
      'insuranceCardBackUploaded',
      'diagnosticEvalUploaded',
      'physicianRxUploaded',
      'medicaidCardFrontUploaded',
      'medicaidCardBackUploaded',
      'iepUploaded',
      'custodyDocsUploaded',
      'priorAbaRecordsUploaded',
    ]);
  });

  it('recognizes clinical verification document keys', () => {
    expect(isClinicalVerificationDocumentKey('diagnosticEvalUploaded')).toBe(true);
    expect(isClinicalVerificationDocumentKey('intakeFormComplete')).toBe(false);
  });
});
