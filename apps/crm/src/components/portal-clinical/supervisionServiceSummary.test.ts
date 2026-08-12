import { describe, expect, it } from 'vitest';

import {
  actualServiceDurationMinutes,
  summarizeSupervisionServiceRecords,
} from './supervisionServiceSummary';

describe('actualServiceDurationMinutes', () => {
  it('returns no duration for missing, reversed, or invalid actual timestamps', () => {
    expect(
      actualServiceDurationMinutes({
        actualStart: null,
        actualEnd: '2026-08-12T14:30:00.000Z',
      })
    ).toBeNull();
    expect(
      actualServiceDurationMinutes({
        actualStart: '2026-08-12T15:00:00.000Z',
        actualEnd: '2026-08-12T14:30:00.000Z',
      })
    ).toBeNull();
    expect(
      actualServiceDurationMinutes({
        actualStart: 'not-a-timestamp',
        actualEnd: 'also-not-a-timestamp',
      })
    ).toBeNull();
  });

  it('summarizes valid persisted actual timestamps as service minutes', () => {
    expect(
      actualServiceDurationMinutes({
        actualStart: '2026-08-12T14:00:00.000Z',
        actualEnd: '2026-08-12T14:45:00.000Z',
      })
    ).toBe(45);
  });
});

describe('summarizeSupervisionServiceRecords', () => {
  it('never treats a 97155 service code as attendance evidence or compliance', () => {
    const summary = summarizeSupervisionServiceRecords(
      [
        {
          status: 'COMPLETED',
          cptCode: '97155',
          actualStart: '2026-08-12T14:00:00.000Z',
          actualEnd: '2026-08-12T15:00:00.000Z',
        },
      ],
      'Aetna'
    );

    expect(summary.service97155).toEqual({
      recordCount: 1,
      completedRecordCount: 1,
      actualServiceMinutes: 60,
    });
    expect(summary.assessmentStatus).toBe('not_assessable');
    expect(summary.assessmentLabel).toBe('N/A');
    expect(summary.evidenceLabel).toBe('Supervision evidence unavailable');
    expect(summary).not.toHaveProperty('compliance');
    expect(summary).not.toHaveProperty('ratioPct');
  });

  it('reports no-policy and no-presence data as not assessable', () => {
    const summary = summarizeSupervisionServiceRecords([], null);

    expect(summary.policyLabel).toBe('Policy not configured');
    expect(summary.evidenceLabel).toBe('Supervision evidence unavailable');
    expect(summary.assessmentStatus).toBe('not_assessable');
    expect(summary.assessmentLabel).toBe('N/A');
  });

  it('uses neutral payer copy when no payer is recorded', () => {
    expect(summarizeSupervisionServiceRecords([], null).payerLabel).toBe(
      'Payer not recorded'
    );
    expect(summarizeSupervisionServiceRecords([], '   ').payerLabel).toBe(
      'Payer not recorded'
    );
    expect(summarizeSupervisionServiceRecords([], '  Healthfirst  ').payerLabel).toBe(
      'Healthfirst'
    );
  });

  it('uses actual completed service time instead of fixed two-hour blocks', () => {
    const summary = summarizeSupervisionServiceRecords(
      [
        {
          status: 'COMPLETED',
          cptCode: '97153',
          actualStart: '2026-08-12T14:00:00.000Z',
          actualEnd: '2026-08-12T14:30:00.000Z',
        },
      ],
      null
    );

    expect(summary.totalActualServiceMinutes).toBe(30);
    expect(summary.service97153.actualServiceMinutes).toBe(30);
    expect(summary.totalActualServiceMinutes).not.toBe(120);
  });

  it('excludes non-completed and invalid-time records from service-time totals', () => {
    const summary = summarizeSupervisionServiceRecords(
      [
        {
          status: 'SCHEDULED',
          cptCode: '97153',
          actualStart: '2026-08-12T14:00:00.000Z',
          actualEnd: '2026-08-12T15:00:00.000Z',
        },
        {
          status: 'COMPLETED',
          cptCode: '97155',
          actualStart: 'invalid',
          actualEnd: '2026-08-12T15:00:00.000Z',
        },
      ],
      null
    );

    expect(summary.potentialServiceRecordCount).toBe(2);
    expect(summary.completedServiceRecordCount).toBe(1);
    expect(summary.completedRecordsWithActualTime).toBe(0);
    expect(summary.completedRecordsMissingActualTime).toBe(1);
    expect(summary.totalActualServiceMinutes).toBe(0);
  });

  it('exposes valid timestamps only as informational service time', () => {
    const summary = summarizeSupervisionServiceRecords(
      [
        {
          status: 'COMPLETED',
          cptCode: '97153',
          actualStart: '2026-08-12T13:00:00.000Z',
          actualEnd: '2026-08-12T14:30:00.000Z',
        },
        {
          status: 'COMPLETED',
          cptCode: '97155',
          actualStart: '2026-08-12T15:00:00.000Z',
          actualEnd: '2026-08-12T15:45:00.000Z',
        },
      ],
      'Fidelis'
    );

    expect(summary.totalActualServiceMinutes).toBe(135);
    expect(summary.service97153.actualServiceMinutes).toBe(90);
    expect(summary.service97155.actualServiceMinutes).toBe(45);
    expect(summary.assessmentLabel).toBe('N/A');
    expect(summary.warnings).toContain(
      'CPT 97155 is a protocol-modification service code, not proof of supervisor attendance.'
    );
  });
});
