/**
 * Shared Assessment / Treatment PA queue buckets.
 * Keep dashboard KPIs identical to `/portal-billing/clients` columns.
 */

export type BillingPaKind = 'ASSESSMENT' | 'TREATMENT';

export type BillingPaRow = {
  type?: string | null;
  status?: string | null;
  vobCompleted?: boolean | null;
  providerCredentialed?: boolean | null;
  expirationDate?: string | Date | null;
  p2pResolved?: boolean | null;
};

export type BillingQueueClient = {
  id: string;
  status?: string | null;
  treatmentPlan?: unknown;
  paRequests?: BillingPaRow[] | null;
};

export function getBillingPa(client: BillingQueueClient, kind: BillingPaKind) {
  return client.paRequests?.find((p) => p.type === kind) ?? null;
}

export function daysUntilPaDate(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function hasParentTreatmentSignature(client: BillingQueueClient): boolean {
  const plan = client.treatmentPlan;
  if (!plan || typeof plan !== 'object') return false;
  return Boolean((plan as { parentSignature?: unknown }).parentSignature);
}

export function isAssessmentPendingVob(client: BillingQueueClient): boolean {
  const pa = getBillingPa(client, 'ASSESSMENT');
  if (pa?.status === 'APPROVED') return false;
  if (pa) return !pa.vobCompleted || !pa.providerCredentialed;
  return client.status === 'CLINICAL_REVIEW_APPROVED';
}

export function isAssessmentInFlight(client: BillingQueueClient): boolean {
  if (isAssessmentPendingVob(client)) return false;
  const pa = getBillingPa(client, 'ASSESSMENT');
  if (pa) {
    if (!pa.vobCompleted || !pa.providerCredentialed) return false;
    return ['NOT_STARTED', 'SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(
      pa.status ?? ''
    );
  }
  return client.status === 'VOB_COMPLETED' || client.status === 'PA_SUBMITTED';
}

export function isAssessmentExpiring(client: BillingQueueClient): boolean {
  const pa = getBillingPa(client, 'ASSESSMENT');
  if (!pa || pa.status !== 'APPROVED' || !pa.expirationDate) return false;
  const days = daysUntilPaDate(pa.expirationDate);
  return days !== null && days <= 45;
}

export function isTreatmentReadyToSubmit(client: BillingQueueClient): boolean {
  const pa = getBillingPa(client, 'TREATMENT');
  if (pa) return pa.status === 'NOT_STARTED';
  return client.status === 'REPORT_ASSEMBLED' && hasParentTreatmentSignature(client);
}

export function isTreatmentInFlight(client: BillingQueueClient): boolean {
  if (isTreatmentReadyToSubmit(client)) return false;
  const pa = getBillingPa(client, 'TREATMENT');
  if (pa) {
    return ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(pa.status ?? '');
  }
  return client.status === 'TX_PA_SUBMITTED';
}

export function isTreatmentExpiring(client: BillingQueueClient): boolean {
  const pa = getBillingPa(client, 'TREATMENT');
  if (!pa || pa.status !== 'APPROVED' || !pa.expirationDate) return false;
  const days = daysUntilPaDate(pa.expirationDate);
  return days !== null && days <= 45;
}

export function isPaDeniedAttention(client: BillingQueueClient, kind: BillingPaKind): boolean {
  return Boolean(
    client.paRequests?.some(
      (p) =>
        p.type === kind &&
        (p.status === 'DENIED_CLERICAL' || (p.status === 'DENIED_CLINICAL' && !p.p2pResolved))
    )
  );
}

export type BillingDashboardMetrics = {
  assessmentRoster: number;
  treatmentRoster: number;
  pendingVob: number;
  assessmentInFlight: number;
  assessmentExpiring: number;
  treatmentReady: number;
  treatmentInFlight: number;
  treatmentExpiring: number;
  deniedAttention: number;
};

export function computeBillingDashboardMetrics(
  assessmentClients: BillingQueueClient[],
  treatmentClients: BillingQueueClient[]
): BillingDashboardMetrics {
  const pendingVob = assessmentClients.filter(isAssessmentPendingVob).length;
  const assessmentInFlight = assessmentClients.filter(isAssessmentInFlight).length;
  const assessmentExpiring = assessmentClients.filter(isAssessmentExpiring).length;
  const treatmentReady = treatmentClients.filter(isTreatmentReadyToSubmit).length;
  const treatmentInFlight = treatmentClients.filter(isTreatmentInFlight).length;
  const treatmentExpiring = treatmentClients.filter(isTreatmentExpiring).length;
  const deniedAttention =
    assessmentClients.filter((c) => isPaDeniedAttention(c, 'ASSESSMENT')).length +
    treatmentClients.filter((c) => isPaDeniedAttention(c, 'TREATMENT')).length;

  return {
    assessmentRoster: assessmentClients.length,
    treatmentRoster: treatmentClients.length,
    pendingVob,
    assessmentInFlight,
    assessmentExpiring,
    treatmentReady,
    treatmentInFlight,
    treatmentExpiring,
    deniedAttention,
  };
}
