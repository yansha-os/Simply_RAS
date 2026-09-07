import { describe, expect, it } from 'vitest';

import {
  claimOutcomeLabel,
  claimStatusLabel,
  countClaimStatuses,
  deriveClaimWorkflowStatus,
} from '../clientClaimsEngine';

describe('deriveClaimWorkflowStatus', () => {
  it('maps signature and conversion fields to workflow stages', () => {
    expect(
      deriveClaimWorkflowStatus({
        rbtSigned: true,
        bcbaSigned: false,
        isConverted: false,
        claimOutcome: null,
      }),
    ).toBe('AWAITING_BCBA');

    expect(
      deriveClaimWorkflowStatus({
        rbtSigned: true,
        bcbaSigned: true,
        isConverted: false,
        claimOutcome: null,
      }),
    ).toBe('READY_TO_SUBMIT');

    expect(
      deriveClaimWorkflowStatus({
        rbtSigned: true,
        bcbaSigned: true,
        isConverted: true,
        claimOutcome: null,
      }),
    ).toBe('SUBMITTED');

    expect(
      deriveClaimWorkflowStatus({
        rbtSigned: true,
        bcbaSigned: true,
        isConverted: true,
        claimOutcome: 'APPROVED',
      }),
    ).toBe('APPROVED');

    expect(
      deriveClaimWorkflowStatus({
        rbtSigned: true,
        bcbaSigned: true,
        isConverted: true,
        claimOutcome: 'DENIED_CLINICAL',
      }),
    ).toBe('DENIED');
  });
});

describe('claim labels and counts', () => {
  it('formats status and outcome labels', () => {
    expect(claimStatusLabel('READY_TO_SUBMIT')).toBe('Ready to submit');
    expect(claimOutcomeLabel('DENIED_CLERICAL')).toBe('Denied (clerical)');
  });

  it('aggregates counts by derived status', () => {
    const counts = countClaimStatuses([
      { rbtSigned: true, bcbaSigned: false, isConverted: false, claimOutcome: null },
      { rbtSigned: true, bcbaSigned: true, isConverted: false, claimOutcome: null },
      { rbtSigned: true, bcbaSigned: true, isConverted: true, claimOutcome: 'APPROVED' },
    ]);
    expect(counts.AWAITING_BCBA).toBe(1);
    expect(counts.READY_TO_SUBMIT).toBe(1);
    expect(counts.APPROVED).toBe(1);
  });
});
