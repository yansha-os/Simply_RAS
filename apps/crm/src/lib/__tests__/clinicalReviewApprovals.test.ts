import { describe, expect, it } from 'vitest';

import {
  CLINICAL_REVIEW_APPROVALS_KEY,
  addClinicalReviewApproval,
  applyClinicalDocumentCorrection,
  clearClinicalReviewApprovals,
  getRequiredClinicalReviewApprovalKeys,
  hasAllRequiredClinicalReviewApprovals,
  isClinicalFamilyCorrectionLoop,
  nextClientStatusAfterClinicalCorrection,
  packetStatusAfterClinicalCorrectionResubmit,
  parentNeedsClinicalCorrectionAction,
  parseClinicalReviewApprovals,
  preserveClinicalReviewApprovals,
  removeClinicalReviewApproval,
  resolveClinicalCorrectionItemState,
  resolveClinicalReviewRowBadge,
  shouldReturnClinicalPacketToIntake,
  shouldShowClinicalNeedsReviewBanner,
  shouldShowClinicalWaitingForFamilyBanner,
  summarizeClinicalCorrectionStates,
} from '../clinicalReviewApprovals';

describe('clinicalReviewApprovals', () => {
  it('parses and deduplicates stored approval keys', () => {
    const formData = {
      [CLINICAL_REVIEW_APPROVALS_KEY]: [
        'insuranceCardFrontUploaded',
        'insuranceCardFrontUploaded',
        'not-a-key',
        42,
      ],
    };

    expect(parseClinicalReviewApprovals(formData)).toEqual([
      'insuranceCardFrontUploaded',
    ]);
  });

  it('adds approvals without mutating the source object', () => {
    const formData = { childName: 'Example' };
    const next = addClinicalReviewApproval(formData, 'diagnosticEvalUploaded');

    expect(formData).toEqual({ childName: 'Example' });
    expect(next[CLINICAL_REVIEW_APPROVALS_KEY]).toEqual([
      'diagnosticEvalUploaded',
    ]);
  });

  it('clears stored approvals', () => {
    const formData = {
      childName: 'Example',
      [CLINICAL_REVIEW_APPROVALS_KEY]: ['physicianRxUploaded'],
    };

    expect(clearClinicalReviewApprovals(formData)).toEqual({ childName: 'Example' });
  });

  it('removes one approval without clearing the rest', () => {
    const approvedA = addClinicalReviewApproval({}, 'diagnosticEvalUploaded');
    const approvedBoth = addClinicalReviewApproval(
      approvedA,
      'physicianRxUploaded',
    );

    expect(removeClinicalReviewApproval(approvedBoth, 'physicianRxUploaded')).toEqual({
      [CLINICAL_REVIEW_APPROVALS_KEY]: ['diagnosticEvalUploaded'],
    });
    expect(approvedBoth[CLINICAL_REVIEW_APPROVALS_KEY]).toEqual([
      'diagnosticEvalUploaded',
      'physicianRxUploaded',
    ]);
  });

  it('keeps other approvals when one required document is rejected', () => {
    const formData = [
      'insuranceCardFrontUploaded',
      'insuranceCardBackUploaded',
      'diagnosticEvalUploaded',
      'physicianRxUploaded',
    ].reduce(
      (current, key) =>
        addClinicalReviewApproval(
          current,
          key as 'insuranceCardFrontUploaded',
        ),
      {
        hasMedicaid: 'No',
        docInsuranceFront: { url: '/api/documents?path=c/front.pdf' },
        docEval: { url: '/api/documents?path=c/eval.pdf' },
      } as Record<string, unknown>,
    );

    const correction = applyClinicalDocumentCorrection({
      formData,
      rejectionDetails: {},
      documentKey: 'physicianRxUploaded',
      reason: 'Referral is missing a licensed signature.',
    });

    expect(correction.formData[CLINICAL_REVIEW_APPROVALS_KEY]).toEqual([
      'insuranceCardFrontUploaded',
      'insuranceCardBackUploaded',
      'diagnosticEvalUploaded',
    ]);
    expect(correction.formData.docEval).toEqual({
      url: '/api/documents?path=c/eval.pdf',
    });
    expect(correction.formData.docReferral).toBeUndefined();
    expect(nextClientStatusAfterClinicalCorrection('DOCS_APPROVED_INTAKE')).toBeNull();
    expect(
      resolveClinicalReviewRowBadge({
        isRejected: false,
        isApproved: true,
        isAvailable: true,
        clientStatus: 'DOCS_APPROVED_INTAKE',
        packetStatus: 'APPROVED',
      }),
    ).toBe('APPROVED');
    expect(
      resolveClinicalReviewRowBadge({
        isRejected: true,
        isApproved: false,
        isAvailable: false,
        clientStatus: 'DOCS_APPROVED_INTAKE',
        packetStatus: 'APPROVED',
      }),
    ).toBe('WAITING_FOR_FAMILY');
    expect(
      resolveClinicalReviewRowBadge({
        isRejected: true,
        isApproved: false,
        isAvailable: true,
        clientStatus: 'DOCS_APPROVED_INTAKE',
        packetStatus: 'APPROVED',
      }),
    ).toBe('NEEDS_REVIEW');
    expect(
      packetStatusAfterClinicalCorrectionResubmit('DOCS_APPROVED_INTAKE'),
    ).toBe('APPROVED');
  });

  it('never returns the packet to intake, even when every required document is flagged', () => {
    const formData = { hasMedicaid: 'No' };
    const rejectionDetails = {
      insuranceCardFrontUploaded: 'fix',
      insuranceCardBackUploaded: 'fix',
      diagnosticEvalUploaded: 'fix',
      physicianRxUploaded: 'fix',
    };

    expect(shouldReturnClinicalPacketToIntake(formData, rejectionDetails)).toBe(false);
    expect(nextClientStatusAfterClinicalCorrection('DOCS_APPROVED_INTAKE')).toBeNull();
    expect(nextClientStatusAfterClinicalCorrection('CLINICAL_REVIEW_APPROVED')).toBe(
      'DOCS_APPROVED_INTAKE',
    );
    expect(
      isClinicalFamilyCorrectionLoop({
        clientStatus: 'DOCS_APPROVED_INTAKE',
        packetStatus: 'APPROVED',
        rejectionDetails,
      }),
    ).toBe(true);
    expect(
      resolveClinicalReviewRowBadge({
        isRejected: false,
        isApproved: false,
        isAvailable: true,
        clientStatus: 'DOCS_SUBMITTED',
        packetStatus: 'SUBMITTED',
      }),
    ).toBe('AWAITING_INTAKE');
  });

  it('preserves CSS approvals when the parent resubmits formData', () => {
    const existing = addClinicalReviewApproval(
      { childName: 'Example' },
      'diagnosticEvalUploaded',
    );
    const incoming = { childName: 'Example', docEval: { url: '/api/documents?path=c/eval.pdf' } };

    expect(preserveClinicalReviewApprovals(incoming, existing)[CLINICAL_REVIEW_APPROVALS_KEY]).toEqual([
      'diagnosticEvalUploaded',
    ]);
  });

  it('requires intake forms only when includeIntakeForms is true', () => {
    const formData = { hasMedicaid: 'No' };

    expect(
      getRequiredClinicalReviewApprovalKeys(formData, { includeIntakeForms: false }),
    ).toEqual([
      'insuranceCardFrontUploaded',
      'insuranceCardBackUploaded',
      'diagnosticEvalUploaded',
      'physicianRxUploaded',
    ]);

    expect(
      getRequiredClinicalReviewApprovalKeys(formData, { includeIntakeForms: true }),
    ).toEqual([
      'consentFormComplete',
      'intakeFormComplete',
      'insuranceCardFrontUploaded',
      'insuranceCardBackUploaded',
      'diagnosticEvalUploaded',
      'physicianRxUploaded',
    ]);
  });

  it('detects when every required item has been approved', () => {
    const formData = addClinicalReviewApproval({}, 'insuranceCardFrontUploaded');
    const partial = addClinicalReviewApproval(formData, 'insuranceCardBackUploaded');

    expect(
      hasAllRequiredClinicalReviewApprovals(partial, { includeIntakeForms: false }),
    ).toBe(false);

    const complete = [
      'insuranceCardFrontUploaded',
      'insuranceCardBackUploaded',
      'diagnosticEvalUploaded',
      'physicianRxUploaded',
    ].reduce(
      (current, key) =>
        addClinicalReviewApproval(current, key as 'insuranceCardFrontUploaded'),
      {},
    );

    expect(
      hasAllRequiredClinicalReviewApprovals(complete, { includeIntakeForms: false }),
    ).toBe(true);
  });

  describe('flagged document three-state machine', () => {
    const uploaded = { url: '/api/documents?path=c/front-v2.pdf', name: 'front-v2.pdf' };
    const rejectionDetails = {
      insuranceCardFrontUploaded: '[Clinical Review] rgsdregsrg',
    };
    const loopArgs = {
      clientStatus: 'DOCS_APPROVED_INTAKE',
      packetStatus: 'APPROVED',
      rejectionDetails,
    };

    it('1. awaiting family — flagged with no new upload', () => {
      const formData = { hasMedicaid: 'No' };

      expect(
        resolveClinicalCorrectionItemState({
          isRejected: true,
          isApproved: false,
          hasNewUpload: false,
        }),
      ).toBe('AWAITING_FAMILY');
      expect(summarizeClinicalCorrectionStates(formData, rejectionDetails)).toEqual({
        awaitingFamilyKeys: ['insuranceCardFrontUploaded'],
        needsCssReviewKeys: [],
        hasAwaitingFamily: true,
        hasNeedsCssReview: false,
      });
      expect(isClinicalFamilyCorrectionLoop(loopArgs)).toBe(true);
      expect(
        shouldShowClinicalWaitingForFamilyBanner({ ...loopArgs, formData }),
      ).toBe(true);
      expect(
        shouldShowClinicalNeedsReviewBanner({ ...loopArgs, formData }),
      ).toBe(false);
      expect(
        parentNeedsClinicalCorrectionAction({
          formData,
          rejectionDetails,
          packetDocFlags: { insuranceCardFrontUploaded: false },
        }),
      ).toBe(true);
    });

    it('2. needs CSS review — flagged and a new file is present', () => {
      const formData = { hasMedicaid: 'No', docInsuranceFront: uploaded };

      expect(
        resolveClinicalCorrectionItemState({
          isRejected: true,
          isApproved: false,
          hasNewUpload: true,
        }),
      ).toBe('NEEDS_CSS_REVIEW');
      expect(summarizeClinicalCorrectionStates(formData, rejectionDetails)).toEqual({
        awaitingFamilyKeys: [],
        needsCssReviewKeys: ['insuranceCardFrontUploaded'],
        hasAwaitingFamily: false,
        hasNeedsCssReview: true,
      });
      expect(isClinicalFamilyCorrectionLoop(loopArgs)).toBe(true);
      expect(
        shouldShowClinicalWaitingForFamilyBanner({ ...loopArgs, formData }),
      ).toBe(false);
      expect(
        shouldShowClinicalNeedsReviewBanner({ ...loopArgs, formData }),
      ).toBe(true);
      expect(
        parentNeedsClinicalCorrectionAction({
          formData,
          rejectionDetails,
          packetDocFlags: { insuranceCardFrontUploaded: false },
        }),
      ).toBe(true);
      expect(
        parentNeedsClinicalCorrectionAction({
          formData,
          rejectionDetails,
          packetDocFlags: { insuranceCardFrontUploaded: true },
        }),
      ).toBe(false);
    });

    it('3. approved — CSS cleared the flag', () => {
      expect(
        resolveClinicalCorrectionItemState({
          isRejected: false,
          isApproved: true,
          hasNewUpload: true,
        }),
      ).toBe('APPROVED');
      expect(summarizeClinicalCorrectionStates({ docInsuranceFront: uploaded }, {})).toEqual({
        awaitingFamilyKeys: [],
        needsCssReviewKeys: [],
        hasAwaitingFamily: false,
        hasNeedsCssReview: false,
      });
      expect(
        shouldShowClinicalWaitingForFamilyBanner({
          ...loopArgs,
          rejectionDetails: {},
          formData: { docInsuranceFront: uploaded },
        }),
      ).toBe(false);
    });

    it('keeps waiting-for-family when any flagged doc still lacks a file', () => {
      const formData = { docInsuranceFront: uploaded };
      const mixed = {
        insuranceCardFrontUploaded: 'blurry',
        physicianRxUploaded: 'missing signature',
      };

      expect(summarizeClinicalCorrectionStates(formData, mixed)).toMatchObject({
        awaitingFamilyKeys: ['physicianRxUploaded'],
        needsCssReviewKeys: ['insuranceCardFrontUploaded'],
        hasAwaitingFamily: true,
      });
      expect(
        shouldShowClinicalWaitingForFamilyBanner({
          ...loopArgs,
          rejectionDetails: mixed,
          formData,
        }),
      ).toBe(true);
    });
  });
});
