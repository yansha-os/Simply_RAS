import { describe, expect, it } from 'vitest';

import {
  CLIENT_STATUS_PIPELINE,
  STATUS_GUIDANCE,
  assertPredecessor,
  getStatusGuidance,
  statusIndex,
} from '../clientStatusGates';

describe('CLIENT_STATUS_PIPELINE ordering', () => {
  it('keeps ACTIVE strictly after STAFFING_PENDING (Bridge E)', () => {
    expect(statusIndex('ACTIVE')).toBeGreaterThan(statusIndex('STAFFING_PENDING'));
  });

  it('keeps DISCHARGED last', () => {
    expect(statusIndex('DISCHARGED')).toBe(CLIENT_STATUS_PIPELINE.length - 1);
  });

  it('returns -1 for unknown statuses', () => {
    expect(statusIndex('NOT_A_STATUS')).toBe(-1);
  });
});

describe('STATUS_GUIDANCE completeness', () => {
  it('covers every pipeline status with a matching status field', () => {
    for (const status of CLIENT_STATUS_PIPELINE) {
      const guidance = STATUS_GUIDANCE[status];
      expect(guidance).toBeDefined();
      expect(guidance.status).toBe(status);
      expect(guidance.nextAction.length).toBeGreaterThan(0);
      expect(guidance.owner.length).toBeGreaterThan(0);
    }
  });

  it('falls back safely for unknown statuses without throwing', () => {
    const guidance = getStatusGuidance('GARBAGE');
    expect(guidance.title).toBe('Unknown Status');
    expect(guidance.sop).toContain('GARBAGE');
  });
});

describe('assertPredecessor gates', () => {
  it('allows advancing from an allowed predecessor', () => {
    const res = assertPredecessor('STAFFING_PENDING', ['STAFFING_PENDING'], 'ACTIVE');
    expect(res).toEqual({ ok: true, alreadyPast: false });
  });

  it('never allows fake ACTIVE from earlier statuses (staffing accept alone)', () => {
    for (const early of ['INQUIRY', 'PA_APPROVED', 'TX_PA_APPROVED'] as const) {
      const res = assertPredecessor(early, ['STAFFING_PENDING'], 'ACTIVE');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('Pipeline gate');
      }
    }
  });

  it('is idempotent when already at/past the target (no downgrade)', () => {
    const res = assertPredecessor('ACTIVE', ['STAFFING_PENDING'], 'ACTIVE');
    expect(res).toEqual({ ok: true, alreadyPast: true });
  });

  it('blocks unknown current statuses when a target is given', () => {
    const res = assertPredecessor('BOGUS', ['STAFFING_PENDING'], 'ACTIVE');
    expect(res.ok).toBe(false);
  });

  it('includes next-action guidance in gate errors', () => {
    const res = assertPredecessor('INQUIRY', ['VOB_COMPLETED'], 'PA_SUBMITTED');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain(STATUS_GUIDANCE.INQUIRY.nextAction);
    }
  });
});
