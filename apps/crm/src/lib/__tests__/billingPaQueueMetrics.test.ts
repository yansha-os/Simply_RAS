import { describe, expect, it } from 'vitest';

import {
  computeBillingDashboardMetrics,
  isAssessmentInFlight,
  isAssessmentPendingVob,
  isPaDeniedAttention,
  isTreatmentReadyToSubmit,
} from '../billingPaQueueMetrics';

describe('billingPaQueueMetrics', () => {
  it('buckets pending VOB separately from in-flight Assessment PA', () => {
    const pendingVob = {
      id: '1',
      status: 'CLINICAL_REVIEW_APPROVED',
      paRequests: [],
    };
    const inFlight = {
      id: '2',
      status: 'VOB_COMPLETED',
      paRequests: [
        {
          type: 'ASSESSMENT' as const,
          status: 'SUBMITTED',
          vobCompleted: true,
          providerCredentialed: true,
        },
      ],
    };

    expect(isAssessmentPendingVob(pendingVob)).toBe(true);
    expect(isAssessmentInFlight(pendingVob)).toBe(false);
    expect(isAssessmentPendingVob(inFlight)).toBe(false);
    expect(isAssessmentInFlight(inFlight)).toBe(true);
  });

  it('counts parent-signed REPORT_ASSEMBLED as treatment ready when no PA row exists', () => {
    expect(
      isTreatmentReadyToSubmit({
        id: '3',
        status: 'REPORT_ASSEMBLED',
        treatmentPlan: { parentSignature: true },
        paRequests: [],
      })
    ).toBe(true);
  });

  it('counts unresolved clinical denials as attention', () => {
    const client = {
      id: '4',
      status: 'PA_SUBMITTED',
      paRequests: [
        {
          type: 'ASSESSMENT' as const,
          status: 'DENIED_CLINICAL',
          p2pResolved: false,
        },
      ],
    };
    expect(isPaDeniedAttention(client, 'ASSESSMENT')).toBe(true);
    expect(isPaDeniedAttention(client, 'TREATMENT')).toBe(false);
  });

  it('computes live dashboard KPIs from the same buckets as the queues', () => {
    const metrics = computeBillingDashboardMetrics(
      [
        { id: 'a', status: 'CLINICAL_REVIEW_APPROVED', paRequests: [] },
        {
          id: 'b',
          status: 'PA_SUBMITTED',
          paRequests: [
            {
              type: 'ASSESSMENT',
              status: 'DENIED_CLERICAL',
              vobCompleted: true,
              providerCredentialed: true,
            },
          ],
        },
      ],
      [
        {
          id: 'c',
          status: 'REPORT_ASSEMBLED',
          treatmentPlan: { parentSignature: true },
          paRequests: [],
        },
      ]
    );

    expect(metrics).toEqual({
      assessmentRoster: 2,
      treatmentRoster: 1,
      pendingVob: 1,
      assessmentInFlight: 1,
      assessmentExpiring: 0,
      treatmentReady: 1,
      treatmentInFlight: 0,
      treatmentExpiring: 0,
      deniedAttention: 1,
    });
  });
});
