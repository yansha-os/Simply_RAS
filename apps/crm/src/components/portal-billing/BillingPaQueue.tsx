'use client';

/**
 * Assessment PA / VOB triage queue. Cards open the billing profile —
 * record VOB and 97151 decisions there, not on the card.
 */

import React from 'react';
import { Clock, FileCheck, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  EmptyColumn,
  PaQueueCard,
  QueueBoard,
  QueueLane,
  QueueSearchInput,
  filterClientsByQuery,
  getPa,
  type PaQueueClient,
} from './PaQueueShared';
import {
  isAssessmentExpiring,
  isAssessmentInFlight,
  isAssessmentPendingVob,
} from '@/lib/billingPaQueueMetrics';

function assessmentPa(client: PaQueueClient) {
  return getPa(client, 'ASSESSMENT');
}

export default function BillingPaQueue({ clients }: { clients: PaQueueClient[] }) {
  const [query, setQuery] = React.useState('');
  const visible = filterClientsByQuery(clients, query);

  const pendingVobQueue = visible.filter(isAssessmentPendingVob);
  const submittedQueue = visible.filter(isAssessmentInFlight);
  const expiringQueue = visible.filter(isAssessmentExpiring);

  const noResults =
    query.trim() !== '' &&
    pendingVobQueue.length + submittedQueue.length + expiringQueue.length === 0;

  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <QueueSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search clients by name…"
        />
        <div className="flex flex-wrap gap-2">
          {[
            {
              label: 'Pending VOB',
              count: pendingVobQueue.length,
              cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            },
            {
              label: 'In flight',
              count: submittedQueue.length,
              cls: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
            },
            {
              label: 'Expiring',
              count: expiringQueue.length,
              cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs font-bold ${stat.cls}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {stat.label}
              <span className="opacity-80">{stat.count}</span>
            </div>
          ))}
        </div>
      </div>

      {noResults && (
        <EmptyColumn message={`No assessment-phase clients match “${query.trim()}”.`} />
      )}

      {!noResults && (
        <QueueBoard
          columns={[
            <QueueLane
              key="pending-vob"
              eyebrow="Column 01"
              title="Pending VOB / Credentialing"
              count={pendingVobQueue.length}
              icon={Clock}
              accentClass="text-emerald-400"
              borderClass="border-emerald-500/20"
            >
              {pendingVobQueue.length === 0 ? (
                <EmptyColumn message="No clients awaiting VOB or credentialing." />
              ) : (
                pendingVobQueue.map((c) => (
                  <PaQueueCard
                    key={c.id}
                    client={c}
                    kind="ASSESSMENT"
                    icon={Clock}
                    accent="emerald"
                    desc="Open the profile VOB tab — verify benefits, copay, deductible, and credentialing."
                  />
                ))
              )}
            </QueueLane>,
            <QueueLane
              key="submit-track"
              eyebrow="Column 02"
              title="Submit / Track Assessment PA"
              count={submittedQueue.length}
              icon={FileCheck}
              accentClass="text-teal-400"
              borderClass="border-teal-500/20"
            >
              {submittedQueue.length === 0 ? (
                <EmptyColumn message="No Assessment PAs ready to submit or awaiting payer decision." />
              ) : (
                submittedQueue.map((c) => {
                  const pa = assessmentPa(c);
                  const desc =
                    pa?.status === 'NOT_STARTED'
                      ? 'VOB complete — open Assessment PA to submit 97151, then mark submitted.'
                      : pa?.status?.startsWith('DENIED')
                        ? 'Denial logged — open Assessment PA to resolve clerical fix or P2P.'
                        : 'PA submitted — open Assessment PA when the payer decision arrives.';

                  return (
                    <PaQueueCard
                      key={c.id}
                      client={c}
                      kind="ASSESSMENT"
                      icon={FileCheck}
                      accent="teal"
                      desc={desc}
                    />
                  );
                })
              )}
            </QueueLane>,
            <QueueLane
              key="expiring"
              eyebrow="Column 03"
              title="Expiring Assessment Auth (<45d)"
              count={expiringQueue.length}
              icon={ShieldAlert}
              accentClass="text-amber-400"
              borderClass="border-amber-500/20"
            >
              {expiringQueue.length === 0 ? (
                <EmptyColumn message="No approved Assessment auths expiring within 45 days." />
              ) : (
                expiringQueue.map((c) => (
                  <PaQueueCard
                    key={c.id}
                    client={c}
                    kind="ASSESSMENT"
                    icon={ShieldAlert}
                    accent="amber"
                    desc="Authorization window closing — open the profile to plan re-auth."
                  />
                ))
              )}
            </QueueLane>,
          ]}
        />
      )}
    </div>
  );
}
