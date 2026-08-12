import { describe, expect, it } from 'vitest';

import {
  canBcbaSign,
  canFlagDeficiency,
  checklistPassedFromSnapshot,
  evaluateConvertGate,
  failedChecklistLabels,
  type ConvertGateNote,
} from '../noteConvertGate';

const passedSnapshot = {
  schemaVersion: 1,
  passed: true,
  checkedAt: '2026-08-12T10:00:00.000Z',
  items: [
    { key: 'SESSION_TIME', label: 'Start / end time recorded', standard: 'BOTH', ok: true },
    { key: 'UNITS', label: 'Billable units ≥ 1 (8-min rule)', standard: 'MEDICAID', ok: true },
  ],
};

const failedSnapshot = {
  schemaVersion: 1,
  passed: false,
  checkedAt: '2026-08-12T10:00:00.000Z',
  items: [
    { key: 'SESSION_TIME', label: 'Start / end time recorded', standard: 'BOTH', ok: true },
    { key: 'CAREGIVER_SIGN', label: 'Caregiver e-signature', standard: 'CASP', ok: false },
  ],
};

function note(overrides: Partial<ConvertGateNote> = {}): ConvertGateNote {
  return {
    rbtSigned: true,
    bcbaSigned: true,
    checklistSnapshot: passedSnapshot,
    ...overrides,
  };
}

describe('evaluateConvertGate (Slice 3 — Bridge F convert gate)', () => {
  it('allows convert only with both signatures and a passed checklist', () => {
    expect(evaluateConvertGate(note())).toEqual({ ok: true });
  });

  it('rejects when BCBA has not e-signed (checked first)', () => {
    const res = evaluateConvertGate(note({ bcbaSigned: false, rbtSigned: false }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BCBA_SIGN');
  });

  it('rejects when RBT signature is missing', () => {
    const res = evaluateConvertGate(note({ rbtSigned: false }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('RBT_SIGN');
  });

  it('rejects when the checklist snapshot is missing entirely', () => {
    for (const snapshot of [null, undefined, 'not-an-object', 42, {}]) {
      const res = evaluateConvertGate(note({ checklistSnapshot: snapshot }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('CHECKLIST_MISSING');
    }
  });

  it('rejects when the frozen checklist failed and names the failed items', () => {
    const res = evaluateConvertGate(note({ checklistSnapshot: failedSnapshot }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CHECKLIST_FAILED');
      expect(res.reason).toContain('Caregiver e-signature');
    }
  });
});

describe('checklistPassedFromSnapshot', () => {
  it('reads the boolean and returns null on malformed blobs', () => {
    expect(checklistPassedFromSnapshot(passedSnapshot)).toBe(true);
    expect(checklistPassedFromSnapshot(failedSnapshot)).toBe(false);
    expect(checklistPassedFromSnapshot(null)).toBeNull();
    expect(checklistPassedFromSnapshot({ passed: 'yes' })).toBeNull();
  });
});

describe('failedChecklistLabels', () => {
  it('lists only failed items and tolerates junk shapes', () => {
    expect(failedChecklistLabels(failedSnapshot)).toEqual(['Caregiver e-signature']);
    expect(failedChecklistLabels(passedSnapshot)).toEqual([]);
    expect(failedChecklistLabels({ items: 'nope' })).toEqual([]);
    expect(failedChecklistLabels(null)).toEqual([]);
  });
});

describe('canBcbaSign (audit H7 — sign state guard)', () => {
  const signableNote = {
    rbtSigned: true,
    bcbaSigned: false,
    isConverted: false,
    checklistSnapshot: passedSnapshot,
    openDeficiencyCount: 0,
    sessionStatus: 'COMPLETED',
  };

  it('allows signing an unsigned, unconverted note', () => {
    expect(canBcbaSign(signableNote)).toEqual({ ok: true });
  });

  it('refuses to manufacture a BCBA signature before the RBT attestation', () => {
    const res = canBcbaSign({ ...signableNote, rbtSigned: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('RBT signature');
  });

  it('refuses to sign while an open deficiency exists', () => {
    const res = canBcbaSign({ ...signableNote, openDeficiencyCount: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('open deficiency');
  });

  it('refuses to sign when the frozen billing checklist is missing or failed', () => {
    for (const checklistSnapshot of [null, failedSnapshot]) {
      const res = canBcbaSign({ ...signableNote, checklistSnapshot });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('checklist');
    }
  });

  it('refuses to sign a note whose session is not completed', () => {
    const res = canBcbaSign({ ...signableNote, sessionStatus: 'SCHEDULED' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('COMPLETED');
  });

  it('refuses to re-sign an already-signed note (would overwrite signer identity)', () => {
    const res = canBcbaSign({ ...signableNote, bcbaSigned: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('already BCBA-signed');
  });

  it('refuses to sign a converted claim record', () => {
    const res = canBcbaSign({ ...signableNote, isConverted: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('converted');
  });
});

describe('canFlagDeficiency (audit H6 — deficiency state guard)', () => {
  it('allows flagging an unconverted note', () => {
    expect(canFlagDeficiency({ isConverted: false })).toEqual({ ok: true });
  });

  it('refuses on converted notes — never strips signatures off a claim record', () => {
    const res = canFlagDeficiency({ isConverted: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('un-convert');
  });
});
