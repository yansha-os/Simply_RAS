/**
 * Bridge E → F → G integration smoke — gate chain without DB (vitest).
 * Session scheduled → Studio complete → BCBA sign → convert gate → payroll hold/release.
 */
import { describe, expect, it } from 'vitest';
import { evaluateAttestationState, REQUIRED_CHECKLIST_KEYS } from '@repo/db/session-note-attestation';
import { getStaffingReadiness } from '../staffingReadiness';
import { derivePayHoldFromFlags } from '../../../../hrm/src/lib/rbtPayHolds';

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

function attestation(overrides: Record<string, unknown> = {}) {
  return {
    sessionStatus: 'COMPLETED',
    parentSigned: true,
    parentSignedAt: SIGNED_AT,
    parentSignerName: 'Caregiver Name',
    rbtSigned: true,
    rbtSignedAt: SIGNED_AT,
    rbtSignerName: 'RBT Name',
    bcbaSigned: false,
    bcbaSignedAt: null,
    bcbaSignerName: null,
    checklistSnapshot: checklist(),
    openDeficiencyCount: 0,
    billableUnits: 4,
    submissionFingerprint: FINGERPRINT,
    isConverted: false,
    ...overrides,
  };
}

describe('Bridge E → F → G integration smoke', () => {
  it('Bridge E: schedule gate opens at STAFFING_PENDING with staffed RBT + BCBA', () => {
    const staffed = getStaffingReadiness({
      status: 'STAFFING_PENDING',
      rbtId: 'rbt-1',
      rbtApproved: true,
      bcbaId: 'bcba-1',
    });
    expect(staffed.canScheduleFirstSession).toBe(true);
  });

  it('Bridge F: BCBA sign blocked before RBT attestation; convert blocked before BCBA', () => {
    const beforeRbt = evaluateAttestationState(
      attestation({ rbtSigned: false, checklistSnapshot: checklist(false) }),
      'BCBA_SIGN',
    );
    expect(beforeRbt.ok).toBe(false);

    const afterRbt = evaluateAttestationState(attestation(), 'BCBA_SIGN');
    expect(afterRbt.ok).toBe(true);

    const beforeConvert = evaluateAttestationState(attestation(), 'DURABLE');
    expect(beforeConvert.ok).toBe(false);
    if (!beforeConvert.ok) {
      expect(beforeConvert.code).toBe('BCBA_ATTESTATION_MISSING');
    }

    const afterBcba = evaluateAttestationState(
      attestation({
        bcbaSigned: true,
        bcbaSignedAt: SIGNED_AT,
        bcbaSignerName: 'BCBA Name',
      }),
      'DURABLE',
    );
    expect(afterBcba.ok).toBe(true);
  });

  it('Bridge G: payroll held until BCBA sign, then payable', () => {
    const held = derivePayHoldFromFlags({
      hasNote: true,
      sessionStatus: 'COMPLETED',
      parentSigned: true,
      parentSignedAt: SIGNED_AT,
      parentSignerName: 'Caregiver',
      rbtSigned: true,
      rbtSignedAt: SIGNED_AT,
      rbtSignerName: 'RBT',
      bcbaSigned: false,
      bcbaSignedAt: null,
      bcbaSignerName: null,
      isConverted: false,
      checklistSnapshot: checklist(),
      openDeficiencyCount: 0,
      billableUnits: 4,
      submissionFingerprint: FINGERPRINT,
    });
    expect(held.payable).toBe(false);

    const payable = derivePayHoldFromFlags({
      hasNote: true,
      sessionStatus: 'COMPLETED',
      parentSigned: true,
      parentSignedAt: SIGNED_AT,
      parentSignerName: 'Caregiver',
      rbtSigned: true,
      rbtSignedAt: SIGNED_AT,
      rbtSignerName: 'RBT',
      bcbaSigned: true,
      bcbaSignedAt: SIGNED_AT,
      bcbaSignerName: 'BCBA',
      isConverted: false,
      checklistSnapshot: checklist(),
      openDeficiencyCount: 0,
      billableUnits: 4,
      submissionFingerprint: FINGERPRINT,
    });
    expect(payable.payable).toBe(true);
  });
});
