import React from 'react';
import BillingQueueTabs from '@/components/portal-billing/BillingQueueTabs';
import { BILLING_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { loadBillingQueue } from './loader';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BillingPortalPage() {
  const access = await requirePersistedStaff(BILLING_ROLES);
  if (!access.ok) notFound();

  const { assessmentClients, treatmentClients } = await loadBillingQueue();

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-2">
        <BillingQueueTabs
          assessmentClients={assessmentClients}
          treatmentClients={treatmentClients}
        />
      </div>
    </div>
  );
}
