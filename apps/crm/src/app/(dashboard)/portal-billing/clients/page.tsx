import React from 'react';
import BillingQueueTabs from '@/components/portal-billing/BillingQueueTabs';
import { BILLING_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { loadBillingQueue } from '../loader';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BillingClientsPage() {
  const access = await requirePersistedStaff(BILLING_ROLES);
  if (!access.ok) notFound();

  const { assessmentClients, treatmentClients } = await loadBillingQueue();

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading tracking-wide">
            Billing &amp; PA Queue
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Manual Plutus tracker — Assessment and Treatment Prior Authorizations from live{' '}
            <span className="font-mono text-zinc-300">PARequest</span> rows. No EDI in this phase.
          </p>
        </div>

        <BillingQueueTabs
          assessmentClients={assessmentClients}
          treatmentClients={treatmentClients}
        />
      </div>
    </div>
  );
}
