import React from 'react';
import BcbaMetricsDashboard from '@/components/portal-clinical/BcbaMetricsDashboard';
import { getBcbaOpsMetrics } from '@/app/actions/bcbaMetricsActions';
import { CLINICAL_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export default async function ClinicalPortalPage() {
  const access = await requirePersistedStaff(CLINICAL_ROLES);
  if (!access.ok) notFound();

  const { metrics } = await getBcbaOpsMetrics();

  return (
    <div className="p-8">
      <BcbaMetricsDashboard metrics={metrics} />
    </div>
  );
}
