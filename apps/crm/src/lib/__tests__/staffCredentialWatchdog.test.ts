import { describe, expect, it } from 'vitest';
import {
  calculateCredentialRosterScorecard,
  evaluateCredentialItem,
  verifyPayerClearance,
  type CredentialDetail,
} from '../staffCredentialWatchdog';

describe('evaluateCredentialItem', () => {
  const asOf = new Date('2026-06-01T00:00:00.000Z');

  it('marks active credential with long validity', () => {
    const cred = evaluateCredentialItem(
      {
        userId: 'u-1',
        credentialType: 'BACB_LICENSE',
        isCredentialed: true,
        expirationDate: '2026-12-31T00:00:00.000Z',
      },
      asOf
    );
    expect(cred.status).toBe('ACTIVE');
    expect(cred.daysUntilExpiration).toBeGreaterThan(60);
  });

  it('marks expiring 30 days correctly', () => {
    const cred = evaluateCredentialItem(
      {
        userId: 'u-1',
        credentialType: 'CPR_CERT',
        isCredentialed: true,
        expirationDate: '2026-06-15T00:00:00.000Z',
      },
      asOf
    );
    expect(cred.status).toBe('EXPIRING_30_DAYS');
    // 2026-06-01T00:00Z is still May 31 in the clinic timezone.
    expect(cred.daysUntilExpiration).toBe(15);
  });

  it('marks expired credential when date has passed', () => {
    const cred = evaluateCredentialItem(
      {
        userId: 'u-1',
        credentialType: 'MEDICAID_PROVIDER_ID',
        isCredentialed: true,
        expirationDate: '2026-05-01T00:00:00.000Z',
      },
      asOf
    );
    expect(cred.status).toBe('EXPIRED');
    expect(cred.daysUntilExpiration).toBeLessThanOrEqual(0);
  });
});

describe('verifyPayerClearance', () => {
  it('does not clear a required identifier row whose credential number is missing', () => {
    const credential = evaluateCredentialItem({
      id: 'npi-without-evidence',
      userId: 'bcba-1',
      credentialType: 'NPI',
      credentialNumber: null,
      payerName: 'ALL_PAYERS',
      isCredentialed: true,
      expirationDate: null,
    });

    const clearance = verifyPayerClearance({
      userId: 'bcba-1',
      staffName: 'BCBA User',
      role: 'BCBA',
      payerName: 'Medicaid',
      credentials: [credential],
    });

    expect(clearance.cleared).toBe(false);
    expect(clearance.missingCredentials).toContain('NPI');
  });

  it('clears staff when all required credentials for role and payer are active', () => {
    const credentials: CredentialDetail[] = [
      {
        id: 'c-1',
        userId: 'bcba-1',
        credentialType: 'NPI',
        credentialNumber: '1234567890',
        payerName: 'ALL_PAYERS',
        isCredentialed: true,
        expirationDate: null,
        status: 'ACTIVE',
        daysUntilExpiration: null,
      },
      {
        id: 'c-2',
        userId: 'bcba-1',
        credentialType: 'CAQH',
        credentialNumber: 'CAQH-999',
        payerName: 'ALL_PAYERS',
        isCredentialed: true,
        expirationDate: '2026-12-31',
        status: 'ACTIVE',
        daysUntilExpiration: 200,
      },
      {
        id: 'c-3',
        userId: 'bcba-1',
        credentialType: 'BACB_LICENSE',
        credentialNumber: '1-23-45678',
        payerName: 'ALL_PAYERS',
        isCredentialed: true,
        expirationDate: '2026-12-31',
        status: 'ACTIVE',
        daysUntilExpiration: 200,
      },
      {
        id: 'c-4',
        userId: 'bcba-1',
        credentialType: 'MEDICAID_PROVIDER_ID',
        credentialNumber: 'NY-MED-777',
        payerName: 'Medicaid',
        isCredentialed: true,
        expirationDate: '2026-12-31',
        status: 'ACTIVE',
        daysUntilExpiration: 200,
      },
    ];

    const clearance = verifyPayerClearance({
      userId: 'bcba-1',
      staffName: 'Dr. Sarah Connor',
      role: 'BCBA',
      payerName: 'Medicaid',
      credentials,
    });

    expect(clearance.cleared).toBe(true);
    expect(clearance.missingCredentials).toHaveLength(0);
  });

  it('fails clearance when a required credential is missing', () => {
    const clearance = verifyPayerClearance({
      userId: 'rbt-1',
      staffName: 'John Doe',
      role: 'RBT',
      payerName: 'Empire BCBS',
      credentials: [],
    });

    expect(clearance.cleared).toBe(false);
    expect(clearance.missingCredentials).toContain('BACB_LICENSE');
    expect(clearance.missingCredentials).toContain('CPR_CERT');
  });
});

describe('calculateCredentialRosterScorecard', () => {
  it('computes agency compliance rate and urgent alerts', () => {
    const staffList = [
      {
        userId: 'u-1',
        staffName: 'Jane BCBA',
        role: 'BCBA',
        credentials: [
          { id: '1', userId: 'u-1', credentialType: 'NPI', credentialNumber: '1234567890', payerName: 'ALL_PAYERS', isCredentialed: true, expirationDate: null, status: 'ACTIVE' as const, daysUntilExpiration: null },
          { id: '2', userId: 'u-1', credentialType: 'CAQH', credentialNumber: '2', payerName: 'ALL_PAYERS', isCredentialed: true, expirationDate: '2026-12-01', status: 'ACTIVE' as const, daysUntilExpiration: 180 },
          { id: '3', userId: 'u-1', credentialType: 'BACB_LICENSE', credentialNumber: '3', payerName: 'ALL_PAYERS', isCredentialed: true, expirationDate: '2026-12-01', status: 'ACTIVE' as const, daysUntilExpiration: 180 },
          { id: '4', userId: 'u-1', credentialType: 'MEDICAID_PROVIDER_ID', credentialNumber: '4', payerName: 'ALL_PAYERS', isCredentialed: true, expirationDate: '2026-12-01', status: 'ACTIVE' as const, daysUntilExpiration: 180 },
        ],
      },
      {
        userId: 'u-2',
        staffName: 'Bob RBT',
        role: 'RBT',
        credentials: [
          { id: '5', userId: 'u-2', credentialType: 'NPI', credentialNumber: '0987654321', payerName: 'ALL_PAYERS', isCredentialed: true, expirationDate: null, status: 'ACTIVE' as const, daysUntilExpiration: null },
          { id: '6', userId: 'u-2', credentialType: 'BACB_LICENSE', credentialNumber: '6', payerName: 'ALL_PAYERS', isCredentialed: true, expirationDate: '2026-06-15', status: 'EXPIRING_30_DAYS' as const, daysUntilExpiration: 14 },
          { id: '7', userId: 'u-2', credentialType: 'CPR_CERT', credentialNumber: '7', payerName: 'ALL_PAYERS', isCredentialed: true, expirationDate: '2026-12-01', status: 'ACTIVE' as const, daysUntilExpiration: 180 },
        ],
      },
    ];

    const scorecard = calculateCredentialRosterScorecard(staffList);
    expect(scorecard.totalStaff).toBe(2);
    expect(scorecard.fullyCredentialedStaffCount).toBe(1);
    expect(scorecard.expiringSoonCount).toBe(1);
    expect(scorecard.complianceRatePct).toBe(50);
    expect(scorecard.urgentAlerts).toHaveLength(1);
    expect(scorecard.urgentAlerts[0].staffName).toBe('Bob RBT');
  });
});
