import { describe, expect, it } from 'vitest';
import {
  evaluateActiveClientDemoHygiene,
  isDemoStudioTargetId,
  structuredContentUsesDemoStudioTargets,
  studioPayloadUsesDemoStudioTargets,
} from '@repo/db/pilot-cohort-hygiene';

describe('isDemoStudioTargetId', () => {
  it('detects dev demo ids and rejects UUIDs', () => {
    expect(isDemoStudioTargetId('t1')).toBe(true);
    expect(isDemoStudioTargetId('b2')).toBe(true);
    expect(isDemoStudioTargetId('123e4567-e89b-42d3-a456-426614174000')).toBe(false);
  });
});

describe('evaluateActiveClientDemoHygiene', () => {
  it('allows demo targets on non-ACTIVE clients', () => {
    expect(
      evaluateActiveClientDemoHygiene('STAFFING_PENDING', {
        trials: [{ targetId: 't1' }],
      }),
    ).toEqual({ ok: true });
  });

  it('blocks ACTIVE clients submitting demo target ids', () => {
    const result = evaluateActiveClientDemoHygiene('ACTIVE', {
      trials: [{ targetId: 't1' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ACTIVE_DEMO_TARGETS');
    }
  });

  it('scans persisted structured content for demo ids', () => {
    expect(
      structuredContentUsesDemoStudioTargets({
        trials: [{ targetId: 't3', response: 'CORRECT' }],
      }),
    ).toBe(true);
    expect(studioPayloadUsesDemoStudioTargets({ trials: [{ targetId: 't1' }] })).toBe(true);
  });
});
