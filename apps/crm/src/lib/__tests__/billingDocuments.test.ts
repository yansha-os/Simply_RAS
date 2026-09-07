import { describe, expect, it } from 'vitest';

import { collectBillingDocuments } from '../billingDocuments';

describe('collectBillingDocuments', () => {
  const clientId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const docUrl = `/api/documents?clientId=${clientId}&path=${encodeURIComponent(`${clientId}/insurance-front.pdf`)}`;

  it('marks PA-required intake docs and computes readiness', () => {
    const summary = collectBillingDocuments({
      clientId,
      formData: {
        insurancePayer: 'Aetna',
        insuranceMemberId: 'MBR-123',
        docInsuranceFront: { url: docUrl },
        docInsuranceBack: { url: docUrl },
        docEval: { url: docUrl },
        docReferral: { url: docUrl },
      },
    });

    expect(summary.insurancePayer).toBe('Aetna');
    expect(summary.requiredPresentCount).toBe(4);
    expect(summary.readinessPct).toBe(100);
    expect(summary.items.some((item) => item.key === 'docEval' && item.requiredForPa)).toBe(
      true
    );
  });

  it('includes billing-relevant chart vault categories', () => {
    const summary = collectBillingDocuments({
      clientId,
      formData: {},
      vaultItems: [
        {
          id: 'vault-1',
          clientId,
          type: 'PRIOR_TREATMENT_PLAN',
          category: 'INSURANCE_AND_AUTH',
          displayName: 'Prior ABA Treatment Plan / PA Letter',
          fileUrl: docUrl,
          expirationDate: null,
          isVerified: true,
          isExpired: false,
          daysUntilExpiration: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(summary.items.some((item) => item.source === 'vault')).toBe(true);
    expect(summary.presentCount).toBeGreaterThanOrEqual(1);
  });
});
