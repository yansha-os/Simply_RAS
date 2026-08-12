export type ClinicalSupportClient = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  bcbaId: string | null;
  updatedAt: string | Date;
  treatmentPlan: unknown;
  intakePacket: { status: string } | null;
  bcba: { firstName: string; lastName: string } | null;
};

export type ClinicalSupportQueues = {
  documentReview: ClinicalSupportClient[];
  assessmentScheduling: ClinicalSupportClient[];
  reportAssembly: ClinicalSupportClient[];
  billingHandoff: ClinicalSupportClient[];
  total: number;
};

export type ReportReadiness = {
  ready: boolean;
  planComplete: boolean;
  parentSigned: boolean;
  blockers: string[];
};

export const CLINICAL_SUPPORT_QUEUE_STATUSES = [
  'DOCS_APPROVED_INTAKE',
  'PA_APPROVED',
  'ASSESSMENT_SCHEDULED',
  'REPORT_ASSEMBLED',
] as const;

export function buildClinicalSupportQueues(
  clients: ClinicalSupportClient[],
): ClinicalSupportQueues {
  const documentReview = clients.filter(
    (client) => client.status === 'DOCS_APPROVED_INTAKE',
  );
  const assessmentScheduling = clients.filter(
    (client) => client.status === 'PA_APPROVED',
  );
  const reportAssembly = clients.filter(
    (client) => client.status === 'ASSESSMENT_SCHEDULED',
  );
  const billingHandoff = clients.filter(
    (client) => client.status === 'REPORT_ASSEMBLED',
  );

  return {
    documentReview,
    assessmentScheduling,
    reportAssembly,
    billingHandoff,
    total:
      documentReview.length +
      assessmentScheduling.length +
      reportAssembly.length +
      billingHandoff.length,
  };
}

export function parseTreatmentPlan(rawPlan: unknown): Record<string, unknown> {
  if (typeof rawPlan === 'string') {
    try {
      const parsed: unknown = JSON.parse(rawPlan);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return rawPlan && typeof rawPlan === 'object' && !Array.isArray(rawPlan)
    ? (rawPlan as Record<string, unknown>)
    : {};
}

export function getReportReadiness(rawPlan: unknown): ReportReadiness {
  const plan = parseTreatmentPlan(rawPlan);
  const planComplete = plan.status === 'COMPLETED';
  const parentSigned =
    typeof plan.parentSignature === 'string' &&
    plan.parentSignature.trim().length > 0;
  const blockers: string[] = [];

  if (!planComplete) blockers.push('BCBA treatment plan');
  if (!parentSigned) blockers.push('Parent signature');

  return {
    ready: blockers.length === 0,
    planComplete,
    parentSigned,
    blockers,
  };
}
