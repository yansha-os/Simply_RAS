import { describe, expect, it } from 'vitest';

import { REQUIRED_CHECKLIST_KEYS } from '@repo/db/session-note-attestation';
import {
  checklistPassedFromSnapshot,
  derivePayHoldFromFlags,
  estimateUnitsFromWindow,
  loadRbtPayHolds,
  resolvePayrollUnits,
  type SessionPayFlags,
} from '../rbtPayHolds';

const SIGNED_AT = '2026-08-12T15:00:00.000Z';
const FINGERPRINT = 'a'.repeat(64);

function checklist(passed = true) {
  return {
    schemaVersion: 1,
    passed,
    checkedAt: SIGNED_AT,
    items: REQUIRED_CHECKLIST_KEYS.map((key) => ({
      key,
      label: key,
      standard: 'BOTH',
      ok: passed,
    })),
  };
}

function flags(overrides: Partial<SessionPayFlags> = {}): SessionPayFlags {
  return {
    hasNote: true,
    sessionStatus: 'COMPLETED',
    parentSigned: true,
    parentSignedAt: SIGNED_AT,
    parentSignerName: 'Caregiver Name',
    rbtSigned: true,
    rbtSignedAt: SIGNED_AT,
    rbtSignerName: 'RBT Name',
    bcbaSigned: true,
    bcbaSignedAt: SIGNED_AT,
    bcbaSignerName: 'BCBA Name',
    isConverted: false,
    checklistSnapshot: checklist(),
    openDeficiencyCount: 0,
    billableUnits: 4,
    submissionFingerprint: FINGERPRINT,
    ...overrides,
  };
}

describe('derivePayHoldFromFlags (fail-closed durable payroll gate)', () => {
  it('is payable only for the complete durable attestation chain', () => {
    expect(derivePayHoldFromFlags(flags())).toEqual({
      payable: true,
      holdReason: null,
      reasonCode: null,
      manualReviewRequired: false,
    });
  });

  it.each([
    ['completed Session', { sessionStatus: 'IN_PROGRESS' }, 'SESSION_NOT_COMPLETED'],
    ['parent attestation', { parentSigned: false }, 'PARENT_ATTESTATION_MISSING'],
    ['RBT attestation', { rbtSigned: false }, 'RBT_ATTESTATION_MISSING'],
    ['BCBA attestation', { bcbaSigned: false }, 'BCBA_ATTESTATION_MISSING'],
    ['passed checklist', { checklistSnapshot: checklist(false) }, 'CHECKLIST_FAILED'],
    ['closed deficiencies', { openDeficiencyCount: 1 }, 'OPEN_DEFICIENCY'],
    ['positive durable units', { billableUnits: 0 }, 'BILLABLE_UNITS_NON_POSITIVE'],
  ] as const)('holds pay without %s', (_label, overrides, reasonCode) => {
    expect(derivePayHoldFromFlags(flags(overrides))).toMatchObject({
      payable: false,
      reasonCode,
    });
  });

  it('never lets isConverted bypass a broken attestation', () => {
    expect(
      derivePayHoldFromFlags(
        flags({
          isConverted: true,
          parentSigned: false,
          rbtSigned: false,
          bcbaSigned: false,
          checklistSnapshot: null,
          billableUnits: null,
        }),
      ),
    ).toMatchObject({
      payable: false,
      reasonCode: 'PARENT_ATTESTATION_MISSING',
    });
  });

  it('holds estimates instead of treating them as earnings truth', () => {
    const estimated = resolvePayrollUnits(null, 8);
    expect(estimated).toEqual({ units: 8, source: 'ESTIMATE' });
    expect(
      derivePayHoldFromFlags(flags({ billableUnits: null })),
    ).toMatchObject({
      payable: false,
      reasonCode: 'BILLABLE_UNITS_MISSING',
      manualReviewRequired: true,
    });
  });

  it('routes malformed legacy state to manual review', () => {
    expect(
      derivePayHoldFromFlags(
        flags({ checklistSnapshot: { passed: true } }),
      ),
    ).toMatchObject({
      payable: false,
      reasonCode: 'CHECKLIST_MALFORMED',
      manualReviewRequired: true,
    });
  });

  it('distinguishes missing-note holds by session status', () => {
    expect(
      derivePayHoldFromFlags(flags({ hasNote: false, sessionStatus: 'COMPLETED' })),
    ).toMatchObject({
      payable: false,
      reasonCode: 'SESSION_NOTE_MISSING',
      holdReason: expect.stringContaining('Missing session note'),
    });
    expect(
      derivePayHoldFromFlags(flags({ hasNote: false, sessionStatus: 'IN_PROGRESS' })),
    ).toMatchObject({
      payable: false,
      reasonCode: 'SESSION_NOTE_MISSING',
      holdReason: expect.stringContaining('in progress'),
    });
  });
});

describe('resolvePayrollUnits — estimate display only', () => {
  it('prefers positive persisted SessionNote.billableUnits', () => {
    expect(resolvePayrollUnits(3, 8)).toEqual({ units: 3, source: 'NOTE' });
  });

  it('labels fallback duration values as estimates', () => {
    for (const noteUnits of [null, undefined, 0, -2, Number.NaN]) {
      expect(resolvePayrollUnits(noteUnits, 4)).toEqual({
        units: 4,
        source: 'ESTIMATE',
      });
    }
  });

  it('floors fractional legacy note units for display without making them payable', () => {
    expect(resolvePayrollUnits(2.9, 1)).toEqual({ units: 2, source: 'NOTE' });
    expect(
      derivePayHoldFromFlags(flags({ billableUnits: 2.9 })),
    ).toMatchObject({
      payable: false,
      reasonCode: 'BILLABLE_UNITS_MALFORMED',
      manualReviewRequired: true,
    });
  });
});

describe('estimateUnitsFromWindow', () => {
  it('computes display-only 15-minute estimates with no minimum unit', () => {
    const start = Date.parse('2026-08-12T10:00:00Z');
    expect(estimateUnitsFromWindow(start, start + 60 * 60_000)).toBe(4);
    expect(estimateUnitsFromWindow(start, start + 44 * 60_000)).toBe(2);
    expect(estimateUnitsFromWindow(start, start + 5 * 60_000)).toBe(0);
    expect(estimateUnitsFromWindow(start, start)).toBe(0);
  });

  it('handles NaN, negative timestamps, and endMs <= startMs safely', () => {
    expect(estimateUnitsFromWindow(NaN, 1000)).toBe(0);
    expect(estimateUnitsFromWindow(1000, NaN)).toBe(0);
    expect(estimateUnitsFromWindow(5000, 2000)).toBe(0);
  });
});

describe('checklist and local hold compatibility helpers', () => {
  it('reads only complete canonical checklist snapshots', () => {
    expect(checklistPassedFromSnapshot(checklist(true))).toBe(true);
    expect(checklistPassedFromSnapshot(checklist(false))).toBe(false);
    expect(checklistPassedFromSnapshot({ passed: true })).toBeNull();
  });

  it('returns no local holds outside the browser', () => {
    expect(loadRbtPayHolds()).toEqual([]);
  });
});
