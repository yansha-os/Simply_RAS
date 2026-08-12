import { describe, expect, it } from 'vitest';

import {
  summarizeStaffCredentials,
  REQUIRED_CREDENTIALS_BY_ROLE,
  type CredentialRow,
} from '../staffCredentials';

// Clinic TZ is America/New_York; expirations are date-only and valid through
// clinic end-of-day, mirroring the auth-window semantics in authUnits.ts.
const NOW = new Date('2026-08-12T12:00:00-04:00');

function bacb(overrides: Partial<CredentialRow> = {}): CredentialRow {
  return {
    credentialType: 'BACB_LICENSE',
    isCredentialed: true,
    expirationDate: new Date('2027-01-01T00:00:00Z'),
    ...overrides,
  };
}

function summarize(role: string | null, credentials: CredentialRow[]) {
  return summarizeStaffCredentials({ userId: 'u-1', role, credentials, now: NOW });
}

describe('summarizeStaffCredentials (P2 credential soft gate)', () => {
  it('reports ACTIVE for a BCBA with a current BACB license', () => {
    const res = summarize('BCBA', [bacb()]);
    expect(res.overall).toBe('ACTIVE');
    expect(res.warnings).toEqual([]);
    expect(res.items.find((i) => i.credentialType === 'BACB_LICENSE')?.state).toBe('ACTIVE');
  });

  it('reports EXPIRED with a dated warning when the required license lapsed', () => {
    const res = summarize('RBT', [
      bacb({ expirationDate: new Date('2026-05-01T00:00:00Z') }),
    ]);
    expect(res.overall).toBe('EXPIRED');
    expect(res.warnings.join(' ')).toContain('BACB_LICENSE expired 2026-05-01');
  });

  it('is valid through clinic (ET) end-of-day on the expiration date itself', () => {
    // Expires "today" (2026-08-12) — still active at noon ET
    const res = summarize('BCBA', [
      bacb({ expirationDate: new Date('2026-08-12T00:00:00Z') }),
    ]);
    expect(res.overall).toBe('ACTIVE');

    // ...and expired the next clinic morning
    const nextDay = summarizeStaffCredentials({
      userId: 'u-1',
      role: 'BCBA',
      credentials: [bacb({ expirationDate: new Date('2026-08-12T00:00:00Z') })],
      now: new Date('2026-08-13T08:00:00-04:00'),
    });
    expect(nextDay.overall).toBe('EXPIRED');
  });

  it('reports MISSING when the required type has no row at all', () => {
    const res = summarize('BCBA', [
      { credentialType: 'CPR_CERT', isCredentialed: true, expirationDate: null },
    ]);
    expect(res.overall).toBe('MISSING');
    expect(res.warnings.join(' ')).toContain('No BACB_LICENSE on file');
    expect(res.items.find((i) => i.credentialType === 'BACB_LICENSE')?.state).toBe('MISSING');
  });

  it('treats isCredentialed=false as not active', () => {
    const res = summarize('RBT', [bacb({ isCredentialed: false })]);
    expect(res.overall).toBe('EXPIRED');
    expect(res.warnings.join(' ')).toContain('marked not credentialed');
  });

  it('a renewal row keeps the type ACTIVE alongside an expired row', () => {
    const res = summarize('BCBA', [
      bacb({ expirationDate: new Date('2026-01-01T00:00:00Z') }), // lapsed
      bacb({ expirationDate: new Date('2027-06-01T00:00:00Z') }), // renewal
    ]);
    expect(res.overall).toBe('ACTIVE');
    expect(res.warnings).toEqual([]);
  });

  it('null expirationDate never expires', () => {
    const res = summarize('RBT', [bacb({ expirationDate: null })]);
    expect(res.overall).toBe('ACTIVE');
  });

  it('non-clinical roles are NOT_TRACKED (no required set, no warnings)', () => {
    expect(summarize('BILLING', []).overall).toBe('NOT_TRACKED');
    expect(summarize(null, [bacb()]).overall).toBe('NOT_TRACKED');
    expect(summarize('BILLING', []).warnings).toEqual([]);
  });

  it('non-required expired rows are reported as items but never warn', () => {
    const res = summarize('BCBA', [
      bacb(),
      {
        credentialType: 'CPR_CERT',
        isCredentialed: true,
        expirationDate: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    expect(res.overall).toBe('ACTIVE');
    expect(res.warnings).toEqual([]);
    expect(res.items.find((i) => i.credentialType === 'CPR_CERT')?.state).toBe('EXPIRED');
    expect(res.items.find((i) => i.credentialType === 'CPR_CERT')?.required).toBe(false);
  });

  it('required map covers the clinical roles only', () => {
    expect(REQUIRED_CREDENTIALS_BY_ROLE.BCBA).toContain('BACB_LICENSE');
    expect(REQUIRED_CREDENTIALS_BY_ROLE.RBT).toContain('BACB_LICENSE');
    expect(REQUIRED_CREDENTIALS_BY_ROLE.BILLING).toBeUndefined();
  });
});
