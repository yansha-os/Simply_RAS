import { describe, expect, it } from 'vitest';

import {
  buildClinicalSupportQueues,
  clinicalSupportProfileHref,
  getReportReadiness,
} from './clinicalSupportWorkflow';

function client(
  id: string,
  status: string,
  treatmentPlan: unknown = {},
) {
  return {
    id,
    firstName: 'Test',
    lastName: id,
    status,
    bcbaId: null,
    updatedAt: '2026-08-12T12:00:00.000Z',
    treatmentPlan,
    intakePacket: { status: 'APPROVED' },
    bcba: null,
  };
}

describe('buildClinicalSupportQueues', () => {
  it('classifies only canonical clinical-support handoff stages', () => {
    const queues = buildClinicalSupportQueues([
      client('docs', 'DOCS_APPROVED_INTAKE'),
      client('schedule', 'PA_APPROVED'),
      client('assemble', 'ASSESSMENT_SCHEDULED'),
      client('billing', 'REPORT_ASSEMBLED'),
      client('active', 'ACTIVE'),
      client('intake', 'DOCS_SUBMITTED'),
    ]);

    expect(queues.documentReview.map((item) => item.id)).toEqual(['docs']);
    expect(queues.assessmentScheduling.map((item) => item.id)).toEqual(['schedule']);
    expect(queues.reportAssembly.map((item) => item.id)).toEqual(['assemble']);
    expect(queues.billingHandoff.map((item) => item.id)).toEqual(['billing']);
    expect(queues.total).toBe(4);
  });
});

describe('clinicalSupportProfileHref', () => {
  it('deep-links each queue lane to the matching clinical profile tab', () => {
    expect(clinicalSupportProfileHref('c1', 'documentReview')).toBe(
      '/client/c1?mode=clinical&tab=clinical',
    );
    expect(clinicalSupportProfileHref('c1', 'assessmentScheduling')).toBe(
      '/client/c1?mode=clinical&tab=assessment',
    );
    expect(clinicalSupportProfileHref('c1', 'reportAssembly')).toBe(
      '/client/c1?mode=clinical&tab=report',
    );
    expect(clinicalSupportProfileHref('c1', 'billingHandoff')).toBe(
      '/client/c1?mode=clinical&tab=billing_handoff',
    );
  });
});

describe('getReportReadiness', () => {
  it('reports the durable treatment-plan and parent-signature blockers', () => {
    expect(getReportReadiness({})).toEqual({
      ready: false,
      planComplete: false,
      parentSigned: false,
      blockers: ['BCBA treatment plan', 'Parent signature'],
    });

    expect(getReportReadiness({ status: 'COMPLETED' })).toEqual({
      ready: false,
      planComplete: true,
      parentSigned: false,
      blockers: ['Parent signature'],
    });
  });

  it('accepts legacy JSON strings without inventing readiness', () => {
    expect(
      getReportReadiness(
        JSON.stringify({ status: 'COMPLETED', parentSignature: 'Parent Name' }),
      ),
    ).toEqual({
      ready: true,
      planComplete: true,
      parentSigned: true,
      blockers: [],
    });

    expect(getReportReadiness('{bad json')).toMatchObject({
      ready: false,
      planComplete: false,
      parentSigned: false,
    });
  });
});
