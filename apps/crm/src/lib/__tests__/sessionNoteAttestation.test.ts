import { describe, expect, it } from 'vitest';

import {
  REQUIRED_CHECKLIST_KEYS,
  evaluateAttestationState,
  extractSubmissionFingerprint,
  normalizePlutusReference,
  sanitizeStructuredContentForDeficiency,
  type SessionNoteAttestationInput,
} from '@repo/db/session-note-attestation';

const FINGERPRINT = 'a'.repeat(64);
const SIGNED_AT = '2026-08-12T15:00:00.000Z';

function passedChecklist() {
  return {
    schemaVersion: 1,
    passed: true,
    checkedAt: SIGNED_AT,
    items: REQUIRED_CHECKLIST_KEYS.map((key) => ({
      key,
      label: key,
      standard: 'BOTH',
      ok: true,
    })),
  };
}

function attestation(
  overrides: Partial<SessionNoteAttestationInput> = {},
): SessionNoteAttestationInput {
  return {
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
    checklistSnapshot: passedChecklist(),
    openDeficiencyCount: 0,
    billableUnits: 4,
    submissionFingerprint: FINGERPRINT,
    isConverted: false,
    ...overrides,
  };
}

describe('evaluateAttestationState', () => {
  it('accepts the complete durable chain', () => {
    expect(evaluateAttestationState(attestation(), 'DURABLE')).toEqual({
      ok: true,
      billableUnits: 4,
      submissionFingerprint: FINGERPRINT,
    });
  });

  it.each([
    ['parent attestation', { parentSigned: false }, 'PARENT_ATTESTATION_MISSING'],
    ['RBT attestation', { rbtSigned: false }, 'RBT_ATTESTATION_MISSING'],
    ['completed session', { sessionStatus: 'IN_PROGRESS' }, 'SESSION_NOT_COMPLETED'],
    ['positive durable units', { billableUnits: 0 }, 'BILLABLE_UNITS_NON_POSITIVE'],
    ['open deficiency', { openDeficiencyCount: 1 }, 'OPEN_DEFICIENCY'],
  ] as const)('fails closed when %s is absent', (_label, overrides, code) => {
    const result = evaluateAttestationState(attestation(overrides), 'DURABLE');
    expect(result).toMatchObject({ ok: false, code });
  });

  it('requires complete RBT and caregiver signer metadata before BCBA sign', () => {
    for (const overrides of [
      { parentSignerName: ' ' },
      { parentSignedAt: null },
      { rbtSignerName: '' },
      { rbtSignedAt: 'not-a-date' },
    ]) {
      const result = evaluateAttestationState(
        attestation({ ...overrides, bcbaSigned: false, bcbaSignedAt: null, bcbaSignerName: null }),
        'BCBA_SIGN',
      );
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.code).toMatch(/SIGNER_METADATA/);
    }
  });

  it('does not require a BCBA attestation before the BCBA-sign transition', () => {
    expect(
      evaluateAttestationState(
        attestation({
          bcbaSigned: false,
          bcbaSignedAt: null,
          bcbaSignerName: null,
        }),
        'BCBA_SIGN',
      ),
    ).toMatchObject({ ok: true });
  });

  it('requires BCBA signer metadata for downstream durable eligibility', () => {
    expect(
      evaluateAttestationState(attestation({ bcbaSignerName: '' }), 'DURABLE'),
    ).toMatchObject({
      ok: false,
      code: 'BCBA_SIGNER_METADATA_INCOMPLETE',
    });
  });

  it('checks every flag/checklist/session/unit combination fail-closed', () => {
    const booleans = [false, true] as const;
    let valid = 0;

    for (const parentSigned of booleans) {
      for (const rbtSigned of booleans) {
        for (const bcbaSigned of booleans) {
          for (const checklistPassed of booleans) {
            for (const completed of booleans) {
              for (const positiveUnits of booleans) {
                const checklist = passedChecklist();
                checklist.passed = checklistPassed;
                checklist.items = checklist.items.map((item) => ({
                  ...item,
                  ok: checklistPassed,
                }));
                const result = evaluateAttestationState(
                  attestation({
                    parentSigned,
                    rbtSigned,
                    bcbaSigned,
                    checklistSnapshot: checklist,
                    sessionStatus: completed ? 'COMPLETED' : 'IN_PROGRESS',
                    billableUnits: positiveUnits ? 1 : 0,
                  }),
                  'DURABLE',
                );
                const expected =
                  parentSigned &&
                  rbtSigned &&
                  bcbaSigned &&
                  checklistPassed &&
                  completed &&
                  positiveUnits;
                expect(result.ok).toBe(expected);
                if (result.ok) valid += 1;
              }
            }
          }
        }
      }
    }

    expect(valid).toBe(1);
  });

  it.each([
    [null, 'CHECKLIST_MISSING'],
    [{ passed: true }, 'CHECKLIST_MALFORMED'],
    [
      {
        ...passedChecklist(),
        items: passedChecklist().items.slice(1),
      },
      'CHECKLIST_MALFORMED',
    ],
    [
      {
        ...passedChecklist(),
        items: passedChecklist().items.map((item, index) => ({
          ...item,
          ok: index !== 0,
        })),
      },
      'CHECKLIST_INCONSISTENT',
    ],
  ])('routes malformed legacy checklist state to manual review', (snapshot, code) => {
    const result = evaluateAttestationState(
      attestation({ checklistSnapshot: snapshot }),
      'DURABLE',
    );
    expect(result).toMatchObject({ ok: false, code, manualReviewRequired: true });
  });

  it('routes malformed legacy flags, deficiency counts, units, and fingerprints to review', () => {
    const malformed: Array<Partial<SessionNoteAttestationInput>> = [
      { parentSigned: 'true' },
      { openDeficiencyCount: Number.NaN },
      { billableUnits: 1.5 },
      { submissionFingerprint: 'legacy' },
    ];

    for (const overrides of malformed) {
      const result = evaluateAttestationState(attestation(overrides), 'DURABLE');
      expect(result).toMatchObject({ ok: false, manualReviewRequired: true });
    }
  });
});

describe('attestation projection helpers', () => {
  it('extracts only a canonical submission fingerprint', () => {
    expect(extractSubmissionFingerprint({ submissionFingerprint: FINGERPRINT })).toBe(
      FINGERPRINT,
    );
    expect(extractSubmissionFingerprint({ submissionFingerprint: 'legacy' })).toBeNull();
    expect(extractSubmissionFingerprint(null)).toBeNull();
  });

  it('removes live signature/fingerprint projections but preserves clinical content', () => {
    expect(
      sanitizeStructuredContentForDeficiency({
        submissionFingerprint: FINGERPRINT,
        goalsAddressed: 'Goal IDs only',
        bcbaSignature: { signerName: 'Stale signer', signedAt: SIGNED_AT },
        supervisingBcbaUserId: 'bcba-id',
        supervisingBcbaName: 'Stale signer',
        nested: {
          caregiverSignature: 'Stale caregiver',
          objectiveData: 'Kept',
        },
      }),
    ).toEqual({
      goalsAddressed: 'Goal IDs only',
      supervisingBcbaUserId: null,
      supervisingBcbaName: null,
      nested: {
        objectiveData: 'Kept',
      },
    });
  });

  it('normalizes a nonblank Plutus reference and rejects blank/oversized values', () => {
    expect(normalizePlutusReference('  batch   42  ')).toBe('batch 42');
    expect(normalizePlutusReference(' \n\t ')).toBeNull();
    expect(normalizePlutusReference('x'.repeat(201))).toBeNull();
  });
});
