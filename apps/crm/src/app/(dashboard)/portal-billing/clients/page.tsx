import React from 'react';
import Link from 'next/link';

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
    <div className="p-8">
      <div className="space-y-4 animate-fade-in-up">
        <div>
          <h2 className="font-heading text-2xl font-bold text-white">
            Billing &amp; PA Queue
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Triage only — open a client to record VOB and Assessment PA (97151) in the profile.
            Session claims live on{' '}
            <Link
              href="/portal-billing/claims"
              className="font-semibold text-brand-orange-400 hover:text-brand-orange-300 cursor-pointer"
            >
              Session Claims
            </Link>
            .
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
