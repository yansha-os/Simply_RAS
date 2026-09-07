import { describe, expect, it } from 'vitest';
import { evaluateCohortAuditGate } from '../dualRunAuditEvaluator';

describe('Sandbox Cohort Audit Gate Evaluator', () => {
  it('fails gate 10 when audited note sample is less than 10', () => {
    const res = evaluateCohortAuditGate(8, 0);
    expect(res.isGate10Met).toBe(false);
    expect(res.auditedNoteCount).toBe(8);
  });

  it('fails gate 10 when open discrepancies exist even with >=10 notes', () => {
    const res = evaluateCohortAuditGate(12, 1);
    expect(res.isGate10Met).toBe(false);
    expect(res.openDiscrepancyCount).toBe(1);
  });

  it('passes gate 10 when >=10 notes are audited with 0 open discrepancies', () => {
    const res = evaluateCohortAuditGate(10, 0);
    expect(res.isGate10Met).toBe(true);
  });
});
