import React from 'react';
import BillingDashboard from '@/components/portal-billing/BillingDashboard';
import { BILLING_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { loadBillingDashboardMetrics } from './loader';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BillingPortalPage() {
  const access = await requirePersistedStaff(BILLING_ROLES);
  if (!access.ok) notFound();

  const metrics = await loadBillingDashboardMetrics();

  return (
    <div className="p-8">
      <BillingDashboard metrics={metrics} />
    </div>
  );
}
