import { describe, expect, it } from 'vitest';
import {
  scrubClaimBatch,
  scrubSingleClaim,
  type RawClaimInput,
} from '../claimScrubberEngine';

describe('scrubSingleClaim', () => {
  const baseValidClaim: RawClaimInput = {
    session: {
      id: 'sess-1',
      clientId: 'c-1',
      cptCode: '97153',
      status: 'COMPLETED',
      scheduledStart: '2026-06-10T09:00:00Z',
      scheduledEnd: '2026-06-10T11:00:00Z',
      placeOfServiceCode: '12',
      rbtId: 'rbt-1',
      bcbaId: 'bcba-1',
    },
    note: {
      id: 'note-1',
      billableUnits: 8,
      rbtSigned: true,
      bcbaSigned: true,
      parentSigned: true,
      isConverted: false,
      openDeficiencyCount: 0,
    },
    client: {
      firstName: 'Leo',
      lastName: 'Valdez',
      primaryDiagnosisCode: 'F84.0',
      insurancePayer: 'Medicaid',
    },
    auth: {
      authNumber: 'AUTH-999',
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-12-31T00:00:00Z',
      remainingUnits: 150,
    },
  };

  it('marks a fully compliant note as CLEAN and Plutus-ready', () => {
    const res = scrubSingleClaim(baseValidClaim);
    expect(res.status).toBe('CLEAN');
    expect(res.defects).toHaveLength(0);
    expect(res.plutusReady).toBe(true);
    expect(res.billableUnits).toBe(8);
  });

  it('detects missing auth, missing POS, and missing BCBA co-sign', () => {
    const defective: RawClaimInput = {
      ...baseValidClaim,
      session: {
        ...baseValidClaim.session,
        placeOfServiceCode: '',
      },
      note: {
        ...baseValidClaim.note,
        bcbaSigned: false,
      },
      auth: null,
    };

    const res = scrubSingleClaim(defective);
    expect(res.status).toBe('DEFECTIVE');
    expect(res.plutusReady).toBe(false);
    expect(res.defects.some((d) => d.code === 'MISSING_AUTH_NUMBER')).toBe(true);
    expect(res.defects.some((d) => d.code === 'MISSING_CMS_POS')).toBe(true);
    expect(res.defects.some((d) => d.code === 'MISSING_BCBA_COSIGN')).toBe(true);
  });

  it('detects open deficiencies blocking claim readiness', () => {
    const defective: RawClaimInput = {
      ...baseValidClaim,
      note: {
        ...baseValidClaim.note,
        openDeficiencyCount: 2,
      },
    };

    const res = scrubSingleClaim(defective);
    expect(res.status).toBe('DEFECTIVE');
    expect(res.defects.some((d) => d.code === 'OPEN_NOTE_DEFICIENCIES')).toBe(true);
  });

  it('detects exhausted auth units', () => {
    const defective: RawClaimInput = {
      ...baseValidClaim,
      auth: {
        ...baseValidClaim.auth,
        remainingUnits: 0,
      },
    };

    const res = scrubSingleClaim(defective);
    expect(res.status).toBe('DEFECTIVE');
    expect(res.defects.some((d) => d.code === 'AUTH_UNITS_EXCEEDED')).toBe(true);
  });
});

describe('scrubClaimBatch', () => {
  it('computes clean claim rate and batch revenue projection', () => {
    const claims: RawClaimInput[] = [
      {
        session: {
          id: 's-1',
          clientId: 'c-1',
          cptCode: '97153',
          status: 'COMPLETED',
          scheduledStart: '2026-06-10T09:00:00Z',
          scheduledEnd: '2026-06-10T11:00:00Z',
          placeOfServiceCode: '12',
          rbtId: 'rbt-1',
          bcbaId: 'bcba-1',
        },
        note: {
          id: 'n-1',
          billableUnits: 8,
          rbtSigned: true,
          bcbaSigned: true,
          parentSigned: true,
          isConverted: false,
        },
        client: { firstName: 'A', lastName: 'B', primaryDiagnosisCode: 'F84.0' },
        auth: { authNumber: 'AUTH-1', startDate: '2026-01-01', endDate: '2026-12-31', remainingUnits: 100 },
      },
      {
        session: {
          id: 's-2',
          clientId: 'c-2',
          cptCode: '97153',
          status: 'COMPLETED',
          scheduledStart: '2026-06-10T09:00:00Z',
          scheduledEnd: '2026-06-10T11:00:00Z',
          placeOfServiceCode: '12',
        },
        note: {
          id: 'n-2',
          billableUnits: 8,
          rbtSigned: true,
          bcbaSigned: false, // defective
          parentSigned: true,
          isConverted: false,
        },
        client: { firstName: 'C', lastName: 'D', primaryDiagnosisCode: 'F84.0' },
        auth: { authNumber: 'AUTH-2', startDate: '2026-01-01', endDate: '2026-12-31', remainingUnits: 100 },
      },
    ];

    const batch = scrubClaimBatch(claims, 30);
    expect(batch.totalNotesScrubbed).toBe(2);
    expect(batch.cleanClaimsCount).toBe(1);
    expect(batch.defectiveClaimsCount).toBe(1);
    expect(batch.cleanClaimRatePct).toBe(50);
    expect(batch.totalBillableUnits).toBe(8);
    expect(batch.totalEstimatedRevenue).toBe(240); // 8 * 30
    expect(batch.defectTaxonomy.MISSING_BCBA_COSIGN).toBe(1);
  });
});
