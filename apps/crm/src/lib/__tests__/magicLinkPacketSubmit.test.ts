import { describe, expect, it } from 'vitest';

import {
  applyClinicalDocumentCorrection,
  isClinicalFamilyCorrectionLoop,
} from '../clinicalReviewApprovals';
import {
  evaluateClinicalCorrectionSubmit,
  evaluatePacketFields,
} from '../magicLinkPacketSubmit';

const uploaded = (path: string) => ({
  url: `/api/documents?path=${path}`,
  name: path,
  type: 'application/pdf',
});

describe('evaluateClinicalCorrectionSubmit', () => {
  it('lets a parent submit after CSS rejects one doc and that form key is re-uploaded', () => {
    const before = {
      hasMedicaid: 'No',
      docInsuranceFront: uploaded('front.pdf'),
      docInsuranceBack: uploaded('back.pdf'),
      docEval: uploaded('eval.pdf'),
      docReferral: uploaded('referral.pdf'),
    };

    const correction = applyClinicalDocumentCorrection({
      formData: before,
      rejectionDetails: {},
      documentKey: 'physicianRxUploaded',
      reason: 'Referral is missing a licensed signature.',
    });

    expect(correction.formData.docReferral).toBeUndefined();
    expect(
      isClinicalFamilyCorrectionLoop({
        clientStatus: 'DOCS_APPROVED_INTAKE',
        packetStatus: 'APPROVED',
        rejectionDetails: correction.rejectionDetails,
      }),
    ).toBe(true);

    expect(
      evaluatePacketFields({
        ...correction.formData,
        docReferral: uploaded('referral-v2.pdf'),
      }).complete,
    ).toBe(false);

    const missingUpload = evaluateClinicalCorrectionSubmit(
      correction.formData,
      correction.rejectionDetails,
    );
    expect(missingUpload.complete).toBe(false);
    expect(missingUpload.missingDocs).toEqual(['docReferral']);
    expect(missingUpload.missingForm01).toEqual([]);
    expect(missingUpload.missingForm02).toEqual([]);

    const afterUpload = evaluateClinicalCorrectionSubmit(
      {
        ...correction.formData,
        docReferral: uploaded('referral-v2.pdf'),
      },
      correction.rejectionDetails,
    );
    expect(afterUpload.complete).toBe(true);
    expect(afterUpload.flaggedDocFlags).toEqual({ physicianRxUploaded: true });
  });

  it('does not require Form 01/02 or unrelated documents for a CSS correction', () => {
    const evaluation = evaluateClinicalCorrectionSubmit(
      {
        docInsuranceFront: uploaded('front-v2.pdf'),
      },
      {
        insuranceCardFrontUploaded: '[Clinical Review] Blurry photo.',
      },
    );

    expect(evaluation.complete).toBe(true);
    expect(evaluation.missingForm01).toEqual([]);
    expect(evaluation.missingForm02).toEqual([]);
    expect(evaluation.missingDocs).toEqual([]);
    expect(evaluation.flaggedDocFlags).toEqual({
      insuranceCardFrontUploaded: true,
    });
  });
});
