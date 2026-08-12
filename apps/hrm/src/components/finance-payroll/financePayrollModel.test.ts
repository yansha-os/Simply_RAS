import { describe, expect, it } from 'vitest';

import { buildFinancePayrollCsv } from './financePayrollCsv';
import { REQUIRED_CHECKLIST_KEYS } from '@repo/db/session-note-attestation';
import {
  DEFAULT_FINANCE_PAYROLL_RATE,
  buildFinancePayrollRollup,
  normalizeFinancePayrollRange,
  readSignedLs54Rate,
  type FinancePayrollSessionInput,
} from './financePayrollModel';

function session(
  overrides: Partial<FinancePayrollSessionInput> = {},
): FinancePayrollSessionInput {
  const signedAt = '2026-08-12T15:00:00.000Z';
  return {
    sessionId: 'session-1',
    rbtId: 'rbt-1',
    rbtName: 'Alex Rivera',
    sessionStatus: 'COMPLETED',
    startMs: Date.parse('2026-08-10T13:00:00Z'),
    endMs: Date.parse('2026-08-10T14:00:00Z'),
    noteUnits: 4,
    hasNote: true,
    parentSigned: true,
    parentSignedAt: signedAt,
    parentSignerName: 'Caregiver Name',
    rbtSigned: true,
    rbtSignedAt: signedAt,
    rbtSignerName: 'RBT Name',
    bcbaSigned: true,
    bcbaSignedAt: signedAt,
    bcbaSignerName: 'BCBA Name',
    isConverted: false,
    checklistSnapshot: {
      schemaVersion: 1,
      passed: true,
      checkedAt: signedAt,
      items: REQUIRED_CHECKLIST_KEYS.map((key) => ({
        key,
        label: key,
        standard: 'BOTH',
        ok: true,
      })),
    },
    openDeficiencyCount: 0,
    submissionFingerprint: 'a'.repeat(64),
    ...overrides,
  };
}

describe('normalizeFinancePayrollRange', () => {
  it('defaults to an inclusive 14-day clinic-time window', () => {
    const result = normalizeFinancePayrollRange(
      {},
      new Date('2026-08-12T12:00:00.000Z'),
    );

    expect(result).toMatchObject({
      ok: true,
      range: {
        from: '2026-07-30',
        to: '2026-08-12',
        dayCount: 14,
        timeZone: 'America/New_York',
      },
    });
  });

  it('rejects malformed, reversed, and over-31-day ranges', () => {
    expect(
      normalizeFinancePayrollRange({
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    ).toMatchObject({ ok: false });

    expect(
      normalizeFinancePayrollRange({
        from: '2026-08-12',
        to: '2026-08-11',
      }),
    ).toMatchObject({ ok: false });

    expect(
      normalizeFinancePayrollRange({
        from: '2026-07-12',
        to: '2026-08-12',
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('31 days') });
  });

  it('uses clinic day boundaries across daylight-saving changes', () => {
    const result = normalizeFinancePayrollRange({
      from: '2026-10-31',
      to: '2026-11-02',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.dayCount).toBe(3);
    expect(result.range.start.toISOString()).toBe('2026-10-31T04:00:00.000Z');
    expect(result.range.end.toISOString()).toBe('2026-11-03T04:59:59.999Z');
  });
});

describe('readSignedLs54Rate', () => {
  it('accepts only a positive rate from a signed wage notice', () => {
    expect(readSignedLs54Rate('SIGNED', { rateOfPay: 31.5 })).toBe(31.5);
    expect(readSignedLs54Rate('SENT', { rateOfPay: 31.5 })).toBeNull();
    expect(readSignedLs54Rate('SIGNED', { rateOfPay: 0 })).toBeNull();
    expect(readSignedLs54Rate('SIGNED', { rateOfPay: '31.50' })).toBeNull();
  });
});

describe('buildFinancePayrollRollup', () => {
  it('separates payable estimates from DB-backed holds and unit estimates', () => {
    const rows: FinancePayrollSessionInput[] = [
      session({
        sessionId: 'payable-note',
        noteUnits: 8,
      }),
      session({
        sessionId: 'held-estimate',
        hasNote: false,
        noteUnits: null,
        rbtSigned: false,
        bcbaSigned: false,
      }),
      session({
        sessionId: 'converted-note',
        rbtId: 'rbt-2',
        rbtName: 'Morgan Lee',
        noteUnits: 4,
        bcbaSigned: false,
        bcbaSignedAt: null,
        bcbaSignerName: null,
        isConverted: true,
      }),
    ];

    const rollup = buildFinancePayrollRollup(rows, {
      'rbt-1': { hourlyRate: 30, source: 'SIGNED_LS54' },
    });

    expect(rollup.totals).toMatchObject({
      staffCount: 2,
      sessionCount: 3,
      noteUnits: 12,
      estimatedUnits: 4,
      totalUnits: 16,
      grossEstimate: 118,
      payableUnits: 8,
      payableEstimate: 60,
      heldUnits: 8,
      heldEstimate: 58,
      heldSessionCount: 2,
      defaultRateStaffCount: 1,
    });
    expect(rollup.staff[0]).toMatchObject({
      rbtId: 'rbt-1',
      hourlyRate: 30,
      rateSource: 'SIGNED_LS54',
      payableEstimate: 60,
      heldEstimate: 30,
    });
    expect(rollup.staff[1]).toMatchObject({
      rbtId: 'rbt-2',
      hourlyRate: DEFAULT_FINANCE_PAYROLL_RATE,
      rateSource: 'DEFAULT_ESTIMATE',
      payableEstimate: 0,
      heldEstimate: 28,
    });
    expect(rollup.holds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: expect.stringContaining('Missing session note'),
          sessionCount: 1,
          units: 4,
          amountEstimate: 30,
        }),
        expect.objectContaining({
          reason: expect.stringContaining('BCBA'),
          sessionCount: 1,
          units: 4,
          amountEstimate: 28,
        }),
      ]),
    );
  });
});

describe('buildFinancePayrollCsv', () => {
  it('creates an escaped, de-identified rollup preview with estimate labels', () => {
    const rollup = buildFinancePayrollRollup(
      [
        session({
          rbtName: 'Rivera, Alex',
          noteUnits: 8,
        }),
      ],
      { 'rbt-1': { hourlyRate: 30, source: 'SIGNED_LS54' } },
    );

    const csv = buildFinancePayrollCsv({
      range: {
        from: '2026-08-01',
        to: '2026-08-14',
        dayCount: 14,
        timeZone: 'America/New_York',
      },
      generatedAt: '2026-08-12T12:00:00.000Z',
      ...rollup,
    });

    expect(csv).toContain('"RBT name"');
    expect(csv).toContain('"Payable estimate (not submitted)"');
    expect(csv).toContain('"Rivera, Alex"');
    expect(csv).not.toContain('client');
  });
});
