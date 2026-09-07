import { prisma } from '@/lib/prisma';
import { computeBillingDashboardMetrics } from '@/lib/billingPaQueueMetrics';

const assessmentStatuses = [
  'CLINICAL_REVIEW_APPROVED',
  'VOB_COMPLETED',
  'PA_SUBMITTED',
  'PA_APPROVED',
  'ASSESSMENT_SCHEDULED',
  'REPORT_ASSEMBLED',
] as const;

const treatmentStatuses = [
  'REPORT_ASSEMBLED',
  'TX_PA_SUBMITTED',
  'TX_PA_APPROVED',
  'STAFFING_PENDING',
  'ACTIVE',
] as const;

const queueSelect = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  updatedAt: true,
  treatmentPlan: true,
  paRequests: {
    select: {
      id: true,
      type: true,
      status: true,
      vobCompleted: true,
      providerCredentialed: true,
      authNumber: true,
      approvedUnits: true,
      effectiveDate: true,
      expirationDate: true,
      p2pResolved: true,
      p2pNotes: true,
      updatedAt: true,
    },
  },
  messages: {
    where: { isFromClient: true, readAt: null },
    select: { isFromClient: true, readAt: true },
  },
} as const;

function hasParentTreatmentSignature(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Boolean((value as Record<string, unknown>).parentSignature)
  );
}

function sanitizeTreatmentPlan<
  T extends { treatmentPlan: unknown },
>({ treatmentPlan, ...client }: T) {
  return {
    ...client,
    treatmentPlan: {
      parentSignature: hasParentTreatmentSignature(treatmentPlan),
    },
  };
}

export async function loadBillingQueue() {
  const [assessmentClients, treatmentClients] = await Promise.all([
    prisma.client.findMany({
      where: { status: { in: [...assessmentStatuses] } },
      select: queueSelect,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.client.findMany({
      where: { status: { in: [...treatmentStatuses] } },
      select: queueSelect,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return {
    assessmentClients: assessmentClients.map(sanitizeTreatmentPlan),
    treatmentClients: treatmentClients.map(sanitizeTreatmentPlan),
  };
}

export async function loadBillingDashboardMetrics() {
  const { assessmentClients, treatmentClients } = await loadBillingQueue();
  return computeBillingDashboardMetrics(assessmentClients, treatmentClients);
}
