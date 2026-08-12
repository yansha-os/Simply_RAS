import { describe, expect, it } from 'vitest';
import { REQUIRED_CHECKLIST_KEYS } from '@repo/db/session-note-attestation';

import {
  computeClientAuthUnitBalances,
  evaluateAuthUnitHardStop,
  isAuthUtilizingSession,
  noteCountsTowardAuthUnits,
  sessionNoteBillableUnits,
  type SessionNoteUtilization,
  type SessionWithNoteRow,
} from '../authUnits';

// Auth windows are date-only values (stored at UTC midnight); the lib interprets
// them as clinic-TZ (America/New_York) day boundaries. All session instants
// below carry explicit offsets so the suite passes in any CI timezone.
const SIGNED_AT = '2026-06-15T14:00:00.000Z';
const FINGERPRINT = 'a'.repeat(64);

function makeNote(
  overrides: Partial<SessionNoteUtilization> = {},
): SessionNoteUtilization {
  return {
    billableUnits: 4,
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
    checklistSnapshot: {
      schemaVersion: 1,
      passed: true,
      checkedAt: SIGNED_AT,
      items: REQUIRED_CHECKLIST_KEYS.map((key) => ({
        key,
        label: key,
        standard: 'BOTH',
        ok: true,
      })),
    },
    submissionFingerprint: FINGERPRINT,
    openDeficiencyCount: 0,
    ...overrides,
  };
}

type SessionOverrides = Omit<Partial<SessionWithNoteRow>, 'note'> & {
  note?: Partial<SessionNoteUtilization> | null;
};

function makeSession(overrides: SessionOverrides = {}): SessionWithNoteRow {
  const { note: noteOverride, ...sessionOverrides } = overrides;
  return {
    id: 's-1',
    status: 'COMPLETED',
    cptCode: '97153',
    scheduledStart: new Date('2026-06-15T09:00:00-04:00'),
    scheduledEnd: new Date('2026-06-15T10:00:00-04:00'),
    actualStart: null,
    actualEnd: null,
    note:
      noteOverride === null
        ? null
        : makeNote(noteOverride),
    ...sessionOverrides,
  };
}

describe('noteCountsTowardAuthUnits (signed and/or converted only)', () => {
  it('excludes missing notes', () => {
    expect(noteCountsTowardAuthUnits(null)).toBe(false);
    expect(noteCountsTowardAuthUnits(undefined)).toBe(false);
  });

  it('excludes unsigned, unconverted notes (RBT-only)', () => {
    expect(
      noteCountsTowardAuthUnits(makeNote({ bcbaSigned: false, isConverted: false })),
    ).toBe(false);
  });

  it('counts only complete durable notes and never lets converted bypass BCBA', () => {
    expect(
      noteCountsTowardAuthUnits(makeNote({ bcbaSigned: true, isConverted: false })),
    ).toBe(true);
    expect(
      noteCountsTowardAuthUnits(
        makeNote({
          bcbaSigned: false,
          bcbaSignedAt: null,
          bcbaSignerName: null,
          isConverted: true,
        }),
      ),
    ).toBe(false);
    expect(
      noteCountsTowardAuthUnits(makeNote({ bcbaSigned: true, isConverted: true })),
    ).toBe(true);
  });
});

describe('isAuthUtilizingSession', () => {
  it('excludes cancelled and no-show sessions even when signed', () => {
    expect(isAuthUtilizingSession(makeSession({ status: 'CANCELLED' }))).toBe(false);
    expect(isAuthUtilizingSession(makeSession({ status: 'NO_SHOW' }))).toBe(false);
  });

  it('includes completed sessions with a counting note', () => {
    expect(isAuthUtilizingSession(makeSession())).toBe(true);
  });
});

describe('sessionNoteBillableUnits', () => {
  it('treats null billableUnits as 0', () => {
    expect(
      sessionNoteBillableUnits(
        makeSession({ note: { billableUnits: null } }),
      ),
    ).toBe(0);
  });

  it('treats negative / NaN as 0 and floors fractions', () => {
    expect(
      sessionNoteBillableUnits(
        makeSession({ note: { billableUnits: -2 } }),
      ),
    ).toBe(0);
    expect(
      sessionNoteBillableUnits(
        makeSession({ note: { billableUnits: Number.NaN } }),
      ),
    ).toBe(0);
    expect(
      sessionNoteBillableUnits(
        makeSession({ note: { billableUnits: 3.9 } }),
      ),
    ).toBe(3);
  });
});

describe('computeClientAuthUnitBalances', () => {
  // Wide window that always contains the in-window session dates below.
  // Date-only values, stored as UTC midnight (the Prisma @db date shape).
  const auth = {
    id: 'auth-1',
    type: 'TREATMENT',
    status: 'APPROVED',
    authNumber: 'A123',
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2026-12-31T00:00:00Z'),
    unitsApproved: null,
    cptCodes: [{ code: '97153', unitsApproved: 100 }],
  };

  it('counts signed units, excludes unsigned, counts signed+converted once', () => {
    const result = computeClientAuthUnitBalances({
      clientId: 'c-1',
      authorizations: [auth],
      paRequests: [],
      sessions: [
        // signed only → counts 4
        makeSession({ id: 's-signed' }),
        // unsigned RBT-only → excluded
        makeSession({
          id: 's-unsigned',
          note: { billableUnits: 4, bcbaSigned: false, isConverted: false },
        }),
        // converted only → counts 2
        makeSession({
          id: 's-converted',
          note: { billableUnits: 2, bcbaSigned: false, isConverted: true },
        }),
        // signed AND converted → still counts its 3 units exactly once
        makeSession({
          id: 's-both',
          note: { billableUnits: 3, bcbaSigned: true, isConverted: true },
        }),
      ],
    });

    const line = result.windows[0].lines[0];
    expect(line.cptCode).toBe('97153');
    expect(line.unitsUsed).toBe(4 + 3);
    expect(line.unitsRemaining).toBe(100 - 7);
    expect(line.sessionCount).toBe(2);
    expect(line.signedSessionCount).toBe(2);
    expect(line.convertedSessionCount).toBe(1);
    expect(line.integrityReviewCount).toBe(1);
    expect(line.manualReviewRequired).toBe(true);
  });

  it('excludes sessions outside the auth window', () => {
    const result = computeClientAuthUnitBalances({
      clientId: 'c-1',
      authorizations: [auth],
      paRequests: [],
      sessions: [
        makeSession({
          id: 's-before-window',
          scheduledStart: new Date('2025-06-15T09:00:00-04:00'),
          scheduledEnd: new Date('2025-06-15T10:00:00-04:00'),
        }),
        makeSession({
          id: 's-after-window',
          scheduledStart: new Date('2027-01-02T09:00:00-05:00'),
          scheduledEnd: new Date('2027-01-02T10:00:00-05:00'),
        }),
      ],
    });

    const line = result.windows[0].lines[0];
    expect(line.unitsUsed).toBe(0);
    expect(line.sessionCount).toBe(0);
    expect(line.unitsRemaining).toBe(100);
  });

  it('window end is inclusive through clinic (ET) end-of-day, not host/UTC end-of-day', () => {
    const result = computeClientAuthUnitBalances({
      clientId: 'c-1',
      authorizations: [auth],
      paRequests: [],
      sessions: [
        // Dec 31 2026, 9 pm ET = 2027-01-01T02:00:00Z — UTC hosts used to reject this
        makeSession({
          id: 's-nye-evening',
          scheduledStart: new Date('2026-12-31T21:00:00-05:00'),
          scheduledEnd: new Date('2026-12-31T22:00:00-05:00'),
        }),
        // Jan 1 2027 ET — past the window
        makeSession({
          id: 's-new-year',
          scheduledStart: new Date('2027-01-01T09:00:00-05:00'),
          scheduledEnd: new Date('2027-01-01T10:00:00-05:00'),
        }),
      ],
    });

    const line = result.windows[0].lines[0];
    expect(line.sessionCount).toBe(1);
    expect(line.unitsUsed).toBe(4);
  });

  it('excludes missing durable units and reports manual review', () => {
    const result = computeClientAuthUnitBalances({
      clientId: 'c-1',
      authorizations: [auth],
      paRequests: [],
      sessions: [
        makeSession({
          id: 's-null-units',
          note: { billableUnits: null },
        }),
      ],
    });

    const line = result.windows[0].lines[0];
    expect(line.unitsUsed).toBe(0);
    expect(line.missingBillableUnitsCount).toBe(1);
    expect(line.integrityReviewCount).toBe(1);
    expect(line.manualReviewRequired).toBe(true);
    expect(result.usageNote).toContain('missing durable billableUnits');
  });

  it('never reports negative remaining units', () => {
    const smallAuth = {
      ...auth,
      cptCodes: [{ code: '97153', unitsApproved: 2 }],
    };
    const result = computeClientAuthUnitBalances({
      clientId: 'c-1',
      authorizations: [smallAuth],
      paRequests: [],
      sessions: [makeSession({ id: 's-overrun' })], // 4 units used vs 2 authorized
    });

    const line = result.windows[0].lines[0];
    expect(line.unitsUsed).toBe(4);
    expect(line.unitsRemaining).toBe(0);
  });

  it('uses AUTHORIZED_ONLY method when no signed/converted notes exist', () => {
    const result = computeClientAuthUnitBalances({
      clientId: 'c-1',
      authorizations: [auth],
      paRequests: [],
      sessions: [
        makeSession({
          id: 's-unsigned-only',
          note: { billableUnits: 4, bcbaSigned: false, isConverted: false },
        }),
      ],
    });

    expect(result.usageMethod).toBe('AUTHORIZED_ONLY');
  });

  it('keeps aggregate PA units unattributed and never reports exact utilization', () => {
    const result = computeClientAuthUnitBalances({
      clientId: 'c-1',
      authorizations: [],
      paRequests: [
        {
          id: 'pa-aggregate',
          type: 'TREATMENT',
          status: 'APPROVED',
          authNumber: 'PA-AGG',
          approvedUnits: 50,
          effectiveDate: '2026-01-01',
          expirationDate: '2026-12-31',
        },
      ],
      sessions: [
        makeSession({ id: 's-97153', cptCode: '97153' }),
        makeSession({ id: 's-97155', cptCode: '97155' }),
      ],
    });

    const line = result.windows[0].lines[0];
    expect(line.cptCode).toBe('UNATTRIBUTED');
    expect(line.attribution).toBe('UNATTRIBUTED_AGGREGATE');
    expect(line.manualReviewRequired).toBe(true);
    expect(line.unitsAuthorized).toBe(50);
    expect(line.unitsUsed).toBeNull();
    expect(line.unitsRemaining).toBeNull();
    expect(line.sessionCount).toBe(0);
    expect(result.usageMethod).toBe('AUTHORIZED_ONLY');
  });
});

describe('evaluateAuthUnitHardStop (gap 15 — convert-time overbill stop)', () => {
  const auth = {
    id: 'auth-1',
    type: 'TREATMENT',
    status: 'APPROVED',
    authNumber: 'A123',
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2026-12-31T00:00:00Z'),
    unitsApproved: null,
    cptCodes: [{ code: '97153', unitsApproved: 10 }],
  };

  function stopInput(sessions: SessionWithNoteRow[], targetSessionId: string) {
    return {
      clientId: 'c-1',
      targetSessionId,
      authorizations: [auth],
      paRequests: [],
      sessions,
    };
  }

  it('does not count the target note against itself (bcbaSigned pre-convert)', () => {
    // Target is signed → would sit in unitsUsed; the stop must exclude it.
    // 10 authorized, 4 burned by another note, target requests 4 → fits.
    const res = evaluateAuthUnitHardStop(
      stopInput(
        [
          makeSession({ id: 's-other' }), // 4 units, signed
          makeSession({ id: 's-target' }), // 4 units, signed (the convert target)
        ],
        's-target',
      ),
    );
    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.unitsUsedByOtherNotes).toBe(4);
      expect(res.remainingBeforeNote).toBe(6);
      expect(res.exceeded).toBe(false);
      expect(res.remainingAfterNote).toBe(2);
    }
  });

  it('blocks when requested units exceed the remaining balance', () => {
    // 10 authorized, 8 burned, target requests 4 → exceeds by 2
    const res = evaluateAuthUnitHardStop(
      stopInput(
        [
          makeSession({
            id: 's-burned',
            note: { billableUnits: 8, bcbaSigned: true, isConverted: true },
          }),
          makeSession({ id: 's-target' }),
        ],
        's-target',
      ),
    );
    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.exceeded).toBe(true);
      expect(res.remainingBeforeNote).toBe(2);
      expect(res.requestedUnits).toBe(4);
      expect(res.remainingAfterNote).toBe(-2);
      expect(res.authNumber).toBe('A123');
      expect(res.cptCode).toBe('97153');
    }
  });

  it('allows an exact fit (requested == remaining)', () => {
    // 10 authorized, 6 burned, target requests 4 → exactly consumes the auth
    const res = evaluateAuthUnitHardStop(
      stopInput(
        [
          makeSession({
            id: 's-burned',
            note: { billableUnits: 6, bcbaSigned: true, isConverted: false },
          }),
          makeSession({ id: 's-target' }),
        ],
        's-target',
      ),
    );
    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.exceeded).toBe(false);
      expect(res.remainingAfterNote).toBe(0);
    }
  });

  it('burns only the selected exact CPT line and ignores unrelated CPT fields and sessions', () => {
    const res = evaluateAuthUnitHardStop({
      ...stopInput(
        [
          makeSession({
            id: 's-97153-burned',
            note: { billableUnits: 3, bcbaSigned: true, isConverted: true },
          }),
          makeSession({
            id: 's-97155-unrelated',
            cptCode: '97155',
            note: { billableUnits: 80, bcbaSigned: true, isConverted: true },
          }),
          makeSession({ id: 's-target' }),
        ],
        's-target',
      ),
      authorizations: [
        {
          ...auth,
          cptCodes: [
            { code: '97153', unitsApproved: 10 },
            { code: '97155', unitsApproved: 100 },
          ],
        },
      ],
    });

    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.unitsAuthorized).toBe(10);
      expect(res.unitsUsedByOtherNotes).toBe(3);
      expect(res.remainingBeforeNote).toBe(7);
      expect(res.remainingAfterNote).toBe(3);
    }
  });

  it('ignores unsigned RBT-only notes when computing the burn', () => {
    const res = evaluateAuthUnitHardStop(
      stopInput(
        [
          makeSession({
            id: 's-unsigned',
            note: { billableUnits: 9, bcbaSigned: false, isConverted: false },
          }),
          makeSession({ id: 's-target' }),
        ],
        's-target',
      ),
    );
    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.unitsUsedByOtherNotes).toBe(0);
      expect(res.exceeded).toBe(false);
    }
  });

  it('cannot enforce without a matching authorized window (out-of-window or wrong CPT)', () => {
    const outOfWindow = evaluateAuthUnitHardStop(
      stopInput(
        [
          makeSession({
            id: 's-target',
            scheduledStart: new Date('2027-06-15T09:00:00-04:00'),
            scheduledEnd: new Date('2027-06-15T10:00:00-04:00'),
          }),
        ],
        's-target',
      ),
    );
    expect(outOfWindow.enforced).toBe(false);
    if (!outOfWindow.enforced) {
      expect(outOfWindow.reason).toBe('NO_ELIGIBLE_AUTH_WINDOW');
    }

    const wrongCpt = evaluateAuthUnitHardStop(
      stopInput([makeSession({ id: 's-target', cptCode: '97155' })], 's-target'),
    );
    expect(wrongCpt.enforced).toBe(false);
  });

  it('cannot enforce when the note has no billable units (burns nothing)', () => {
    const res = evaluateAuthUnitHardStop(
      stopInput(
        [
          makeSession({
            id: 's-target',
            note: { billableUnits: null, bcbaSigned: true, isConverted: false },
          }),
        ],
        's-target',
      ),
    );
    expect(res.enforced).toBe(false);
    if (!res.enforced) expect(res.reason).toBe('NO_BILLABLE_UNITS');
  });

  it('routes an aggregate PARequest to manual review instead of treating it as exact CPT coverage', () => {
    const res = evaluateAuthUnitHardStop({
      clientId: 'c-1',
      targetSessionId: 's-target',
      authorizations: [],
      paRequests: [
        {
          id: 'pa-1',
          type: 'TREATMENT',
          status: 'APPROVED',
          authNumber: 'PA-9',
          approvedUnits: 5,
          effectiveDate: new Date('2026-01-01T00:00:00Z'),
          expirationDate: new Date('2026-12-31T00:00:00Z'),
        },
      ],
      sessions: [
        makeSession({
          id: 's-burned',
          cptCode: '97155',
          note: { billableUnits: 3, bcbaSigned: true, isConverted: false },
        }),
        makeSession({ id: 's-target' }), // requests 4 > 2 remaining
      ],
    });
    expect(res.enforced).toBe(false);
    if (!res.enforced) {
      expect(res.manualReviewRequired).toBe(true);
      expect(res.reason).toBe('CPT_ATTRIBUTION_UNAVAILABLE');
      expect(res.candidate).toMatchObject({
        windowId: 'pa-1',
        windowSource: 'PA_REQUEST',
        attribution: 'UNATTRIBUTED_AGGREGATE',
      });
    }
  });

  it('filters an expired Authorization before selecting the current eligible PA cycle', () => {
    const res = evaluateAuthUnitHardStop({
      clientId: 'c-1',
      targetSessionId: 's-target',
      authorizations: [
        {
          ...auth,
          id: 'auth-old',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          cptCodes: [{ code: '97153', unitsApproved: 999 }],
        },
      ],
      paRequests: [
        {
          id: 'pa-current',
          type: 'TREATMENT',
          status: 'APPROVED',
          authNumber: 'PA-CURRENT',
          approvedUnits: 20,
          effectiveDate: '2026-06-01',
          expirationDate: '2026-12-31',
        },
      ],
      sessions: [makeSession({ id: 's-target' })],
    });

    expect(res.enforced).toBe(false);
    if (!res.enforced) {
      expect(res.manualReviewRequired).toBe(true);
      expect(res.reason).toBe('CPT_ATTRIBUTION_UNAVAILABLE');
      expect(res.candidate).toMatchObject({
        windowId: 'pa-current',
        windowSource: 'PA_REQUEST',
        startDate: '2026-06-01',
        endDate: '2026-12-31',
      });
      expect(res.eligibleCandidateCount).toBe(1);
      expect(res.ineligibleCandidateCount).toBe(1);
    }
  });

  it('excludes denied and pending records from hard-stop candidates', () => {
    const res = evaluateAuthUnitHardStop({
      clientId: 'c-1',
      targetSessionId: 's-target',
      authorizations: [
        {
          ...auth,
          id: 'auth-pending',
          status: 'PENDING',
        },
      ],
      paRequests: [
        {
          id: 'pa-denied',
          type: 'TREATMENT',
          status: 'DENIED_CLINICAL',
          authNumber: null,
          approvedUnits: 50,
          effectiveDate: '2026-01-01',
          expirationDate: '2026-12-31',
        },
      ],
      sessions: [makeSession({ id: 's-target' })],
    });

    expect(res.enforced).toBe(false);
    if (!res.enforced) {
      expect(res.manualReviewRequired).toBe(true);
      expect(res.reason).toBe('NO_ELIGIBLE_AUTH_WINDOW');
      expect(res.candidate).toBeNull();
      expect(res.eligibleCandidateCount).toBe(0);
      expect(res.ineligibleCandidateCount).toBe(2);
    }
  });

  it.each([
    ['null start', null, '2026-12-31'],
    ['open end', '2026-01-01', null],
    ['malformed start', 'not-a-date', '2026-12-31'],
    ['impossible calendar date', '2026-02-30', '2026-12-31'],
    ['inverted bounds', '2026-12-31', '2026-01-01'],
  ])('rejects %s instead of treating the window as open-ended', (_label, startDate, endDate) => {
    const res = evaluateAuthUnitHardStop({
      ...stopInput([makeSession({ id: 's-target' })], 's-target'),
      authorizations: [
        {
          ...auth,
          id: 'auth-invalid-bounds',
          startDate,
          endDate,
        },
      ],
    });

    expect(res.enforced).toBe(false);
    if (!res.enforced) {
      expect(res.manualReviewRequired).toBe(true);
      expect(res.reason).toBe('NO_ELIGIBLE_AUTH_WINDOW');
      expect(res.eligibleCandidateCount).toBe(0);
    }
  });

  it('includes service through same-day expiry in America/New_York', () => {
    const res = evaluateAuthUnitHardStop({
      ...stopInput(
        [
          makeSession({
            id: 's-target',
            scheduledStart: new Date('2026-06-15T23:30:00-04:00'),
            scheduledEnd: new Date('2026-06-15T23:45:00-04:00'),
          }),
        ],
        's-target',
      ),
      authorizations: [
        {
          ...auth,
          id: 'auth-same-day',
          startDate: '2026-06-15',
          endDate: '2026-06-15',
        },
      ],
    });

    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.windowId).toBe('auth-same-day');
      expect(res.windowStartDate).toBe('2026-06-15');
      expect(res.windowEndDate).toBe('2026-06-15');
    }
  });

  it('uses clinic calendar dates across spring-forward and fall-back boundaries', () => {
    const evaluateBoundary = (
      id: string,
      dateOnly: string,
      scheduledStart: Date,
      scheduledEnd: Date,
    ) =>
      evaluateAuthUnitHardStop({
        ...stopInput(
          [makeSession({ id: 's-target', scheduledStart, scheduledEnd })],
          's-target',
        ),
        authorizations: [
          {
            ...auth,
            id,
            startDate: dateOnly,
            endDate: dateOnly,
          },
        ],
      });

    const springForward = evaluateBoundary(
      'auth-spring',
      '2026-03-08',
      new Date('2026-03-08T23:30:00-04:00'),
      new Date('2026-03-08T23:45:00-04:00'),
    );
    const fallBack = evaluateBoundary(
      'auth-fall',
      '2026-11-01',
      new Date('2026-11-01T01:30:00-05:00'),
      new Date('2026-11-01T01:45:00-05:00'),
    );

    expect(springForward.enforced).toBe(true);
    expect(fallBack.enforced).toBe(true);
  });

  it('selects the newest eligible cycle and burns only exact-CPT sessions inside that cycle', () => {
    const res = evaluateAuthUnitHardStop({
      clientId: 'c-1',
      targetSessionId: 's-target',
      authorizations: [
        {
          ...auth,
          id: 'auth-cycle-1',
          authNumber: 'CYCLE-1',
          startDate: '2026-01-01',
          endDate: '2026-06-30',
          cptCodes: [{ code: '97153', unitsApproved: 100 }],
        },
        {
          ...auth,
          id: 'auth-cycle-2',
          authNumber: 'CYCLE-2',
          startDate: '2026-07-01',
          endDate: '2026-12-31',
          cptCodes: [{ code: '97153', unitsApproved: 7 }],
        },
      ],
      paRequests: [],
      sessions: [
        makeSession({
          id: 's-old-cycle',
          scheduledStart: new Date('2026-05-15T09:00:00-04:00'),
          scheduledEnd: new Date('2026-05-15T10:00:00-04:00'),
          note: { billableUnits: 80, bcbaSigned: true, isConverted: true },
        }),
        makeSession({
          id: 's-current-cycle',
          scheduledStart: new Date('2026-08-14T09:00:00-04:00'),
          scheduledEnd: new Date('2026-08-14T10:00:00-04:00'),
        }),
        makeSession({
          id: 's-target',
          scheduledStart: new Date('2026-08-15T09:00:00-04:00'),
          scheduledEnd: new Date('2026-08-15T10:00:00-04:00'),
        }),
      ],
    });

    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.windowId).toBe('auth-cycle-2');
      expect(res.authNumber).toBe('CYCLE-2');
      expect(res.unitsUsedByOtherNotes).toBe(4);
      expect(res.remainingBeforeNote).toBe(3);
      expect(res.exceeded).toBe(true);
      expect(res.candidateRank).toBe(1);
    }
  });

  it('never lets an assessment authorization authorize or burn a 97153 service', () => {
    const res = evaluateAuthUnitHardStop({
      ...stopInput(
        [
          makeSession({ id: 's-other' }),
          makeSession({ id: 's-target' }),
        ],
        's-target',
      ),
      authorizations: [
        {
          ...auth,
          id: 'auth-assessment-mismatch',
          type: 'ASSESSMENT',
          cptCodes: [{ code: '97153', unitsApproved: 100 }],
        },
      ],
    });

    expect(res.enforced).toBe(false);
    if (!res.enforced) {
      expect(res.manualReviewRequired).toBe(true);
      expect(res.reason).toBe('AUTH_TYPE_CPT_MISMATCH');
      expect(res.candidate).toMatchObject({
        windowId: 'auth-assessment-mismatch',
        windowType: 'ASSESSMENT',
        matchedCptCode: '97153',
      });
    }
  });

  it('prefers an exact Authorization over an aggregate PA in the same cycle', () => {
    const res = evaluateAuthUnitHardStop({
      ...stopInput([makeSession({ id: 's-target' })], 's-target'),
      authorizations: [
        {
          ...auth,
          id: 'auth-exact',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
      ],
      paRequests: [
        {
          id: 'pa-aggregate',
          type: 'TREATMENT',
          status: 'APPROVED',
          authNumber: 'PA-AGG',
          approvedUnits: 500,
          effectiveDate: '2026-01-01',
          expirationDate: '2026-12-31',
        },
      ],
    });

    expect(res.enforced).toBe(true);
    if (res.enforced) {
      expect(res.windowId).toBe('auth-exact');
      expect(res.windowSource).toBe('AUTHORIZATION');
      expect(res.attribution).toBe('EXACT_CPT');
    }
  });

  it('reports TARGET_SESSION_NOT_FOUND for an unknown session id', () => {
    const res = evaluateAuthUnitHardStop(stopInput([makeSession({ id: 's-1' })], 's-missing'));
    expect(res.enforced).toBe(false);
    if (!res.enforced) expect(res.reason).toBe('TARGET_SESSION_NOT_FOUND');
  });
});